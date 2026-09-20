import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/chartline.js', import.meta.url));
const NODE = process.execPath;

function run(args, input = null) {
  return new Promise((resolve) => {
    const child = spawn(NODE, [BIN, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input ?? '');
  });
}

function makeTemp(contents, name = 'data.csv') {
  const dir = mkdtempSync(join(tmpdir(), 'chartline-'));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return { dir, path };
}

test('CLI bar chart from a CSV file', async () => {
  const { dir, path } = makeTemp('name,score\nalice,3\nbob,9.4\ncarol,0\n');
  try {
    const { code, stdout, stderr } = await run([path, '--type', 'bar', '--width', '10', '--no-color']);
    assert.equal(stderr, '');
    assert.equal(code, 0);
    assert.equal(
      stdout,
      ['max = 9.4 (1 char = 0.94)', 'alice ███        3', 'bob   ██████████ 9.4', 'carol            0', ''].join('\n')
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI line chart from JSONL over stdin', async () => {
  const input = '{"x":1,"v":2}\n{"x":2,"v":4}\n{"x":3,"v":3}\n';
  const { code, stdout, stderr } = await run(['--type', 'line', '--width', '10', '--height', '5'], input);
  assert.equal(stderr, '');
  assert.equal(code, 0);
  assert.equal(
    stdout,
    ['range = 2 ... 4', '     ++', '    +  ++', '  ++     +', ' +', '+', '1    2   3', 'Legend: v +', ''].join('\n')
  );
});

test('CLI --json emits the normalized data shape', async () => {
  const input = 'month,apples,oranges\njan,3,1\nfeb,5,2\n';
  const { code, stdout } = await run(['--json'], input);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout), {
    labels: ['jan', 'feb'],
    series: [
      { name: 'apples', values: [3, 5] },
      { name: 'oranges', values: [1, 2] },
    ],
  });
});

test('CLI --skip-bad skips rows with unparseable numbers', async () => {
  const { dir, path } = makeTemp('name,val\na,1\nb,bad\nc,3\n');
  try {
    const { code, stdout } = await run([path, '--skip-bad', '--width', '10']);
    assert.equal(code, 0);
    assert.equal(stdout, ['max = 3 (1 char = 0.3)', 'a ███        1', 'c ██████████ 3', ''].join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --type line with non-numeric values exits 1', async () => {
  const { code, stderr } = await run(['--type', 'line'], '{"x":1,"v":"big"}\n');
  assert.equal(code, 1);
  assert.match(stderr, /one numeric value column/);
});

test('CLI empty stdin exits 1', async () => {
  const { code, stderr } = await run([], '');
  assert.equal(code, 1);
  assert.match(stderr, /empty input/);
});

test('CLI missing file exits 1', async () => {
  const { code, stderr } = await run(['/no/such/file.csv']);
  assert.equal(code, 1);
  assert.match(stderr, /cannot read/);
});

test('CLI bad CSV row exits 1 with row number', async () => {
  const input = 'name,val\na,1\nb,nope\n';
  const { code, stderr } = await run([], input);
  assert.equal(code, 1);
  assert.match(stderr, /row 3: "nope" in column "val" is not a number/);
});

test('CLI unknown option exits 2', async () => {
  const { code, stderr } = await run(['--frobnicate']);
  assert.equal(code, 2);
  assert.match(stderr, /unknown option "--frobnicate"/);
});

test('CLI invalid format exits 2', async () => {
  const { code } = await run(['--format', 'xml']);
  assert.equal(code, 2);
});

test('CLI invalid type exits 2', async () => {
  const { code } = await run(['--type', 'pie']);
  assert.equal(code, 2);
});

test('CLI invalid height exits 2', async () => {
  const { code, stderr } = await run(['--height', 'abc']);
  assert.equal(code, 2);
  assert.match(stderr, /invalid height "abc"/);
});

test('CLI multi-character --char exits 2', async () => {
  const { code } = await run(['--char', '==']);
  assert.equal(code, 2);
});

test('CLI --version prints semver', async () => {
  const { code, stdout } = await run(['--version']);
  assert.equal(code, 0);
  assert.match(stdout, /^chartline \d+\.\d+\.\d+\n$/);
});

test('CLI --help prints usage', async () => {
  const { code, stdout } = await run(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /usage: chartline/);
  assert.match(stdout, /--type/);
  assert.match(stdout, /--json/);
});

test('CLI auto-sniffs JSONL passed over stdin', async () => {
  const input = '{"label":"a","value":7}\n{"label":"b","value":2}\n';
  const { code, stdout } = await run(['--type', 'bar', '--width', '10'], input);
  assert.equal(code, 0);
  assert.equal(stdout, ['max = 7 (1 char = 0.7)', 'a ██████████ 7', 'b ███        2', ''].join('\n'));
});

test('CLI --json reflects numeric-x sorting', async () => {
  const input = '{"x":3,"v":1}\n{"x":1,"v":3}\n{"x":2,"v":2}\n';
  const { code, stdout } = await run(['--json'], input);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.deepEqual(parsed.labels, ['1', '2', '3']);
  assert.deepEqual(parsed.series[0].values, [3, 2, 1]);
});