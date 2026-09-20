#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseInput } from '../lib/data.js';
import { barChart, stackedBar, lineChart, sparkline } from '../lib/charts.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const HELP = `usage: chartline [options] [file]

Render deterministic ASCII charts in the terminal from CSV or JSONL input.
Reads from FILE, or stdin when no file is given.

input formats:
  csv    header row required: first column is the label/x, remaining
         columns are numeric series (e.g. "month,apples,oranges\\njan,3,1")
  jsonl  one JSON object per line with a "label" or "x" field plus one
         numeric value column (e.g. {"x":1,"value":3})
  auto   sniff the format from the first non-blank character ({ or [ => jsonl)

options:
  -f, --format <csv|jsonl|auto>  input format (default: auto)
  -t, --type <type>              chart type: bar|stacked|line|spark (default: bar)
      --height <n>               plot height for line charts (default: 10)
  -w, --width <n>                max bar length / chart width (default: 40)
      --char <s>                 bar character, single rune (default: ${
        '\u2588'
      })
      --skip-bad                 skip malformed input rows instead of failing
      --json                     print the normalized parsed data as JSON
      --no-color                 disable ANSI colors (auto-disabled when piped)
  -v, --version                  print version
  -h, --help                     print this help

exit codes:
  0  success
  1  data / input errors (empty input, unreadable file, bad rows)
  2  usage errors (unknown option, bad flag value)
`;

const USAGE_HINT = '\nrun "chartline --help" for usage';

function usageError(msg) {
  process.stderr.write(`chartline: ${msg}${USAGE_HINT}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    format: 'auto',
    type: 'bar',
    height: 10,
    width: 40,
    char: '\u2588',
    json: false,
    noColor: false,
    skipBad: false,
    version: false,
    help: false,
    file: null,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = (name) => {
      if (i + 1 >= argv.length) usageError(`option ${name} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case '-f':
      case '--format':
        opts.format = take(a);
        break;
      case '-t':
      case '--type':
        opts.type = take(a);
        break;
      case '--height':
        opts.height = take(a);
        break;
      case '-w':
      case '--width':
        opts.width = take(a);
        break;
      case '--char':
        opts.char = take(a);
        break;
      case '--skip-bad':
        opts.skipBad = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--no-color':
        opts.noColor = true;
        break;
      case '-v':
      case '--version':
        opts.version = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--':
        positional.push(...argv.slice(i + 1));
        i = argv.length;
        break;
      default:
        if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
          usageError(`unknown option "${a}"`);
        }
        positional.push(a);
    }
  }
  if (positional.length > 1) usageError('too many file arguments');
  opts.file = positional[0] || null;
  return opts;
}

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (opts.version) {
  process.stdout.write(`chartline ${pkg.version}\n`);
  process.exit(0);
}
if (!['csv', 'jsonl', 'auto'].includes(opts.format)) usageError(`invalid format "${opts.format}"`);
if (!['bar', 'stacked', 'line', 'spark'].includes(opts.type)) usageError(`invalid type "${opts.type}"`);

const height = parseInt(opts.height, 10);
const width = parseInt(opts.width, 10);
if (Number.isNaN(height)) usageError(`invalid height "${opts.height}" (expected an integer)`);
if (Number.isNaN(width)) usageError(`invalid width "${opts.width}" (expected an integer)`);
if ([...opts.char].length !== 1) usageError(`--char must be a single character, got "${opts.char}"`);

let text;
if (opts.file) {
  try {
    text = readFileSync(opts.file, 'utf8');
  } catch (e) {
    process.stderr.write(`chartline: cannot read "${opts.file}": ${e.message}\n`);
    process.exit(1);
  }
} else {
  text = await readAll(process.stdin);
}

if (text.trim() === '') {
  process.stderr.write(`chartline: empty input (provide a file or piped data)\n`);
  process.exit(1);
}

let data;
try {
  data = parseInput(text, { format: opts.format, skipBad: opts.skipBad });
} catch (e) {
  process.stderr.write(`chartline: ${e.message}\n`);
  process.exit(1);
}

if (opts.json) {
  process.stdout.write(JSON.stringify(data) + '\n');
  process.exit(0);
}

const colors = !opts.noColor && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

let out;
try {
  switch (opts.type) {
    case 'bar':
      out = barChart(data, { width, char: opts.char, colors });
      break;
    case 'stacked':
      out = stackedBar(data, { width, char: opts.char, colors });
      break;
    case 'line':
      out = lineChart(data, { width, height, colors });
      break;
    case 'spark':
      out = sparkline(data.series[0].values, { width });
      break;
    default:
      usageError(`invalid type "${opts.type}"`);
  }
} catch (e) {
  process.stderr.write(`chartline: ${e.message}\n`);
  process.exit(1);
}

process.stdout.write(out + '\n');