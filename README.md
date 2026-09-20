# chartline

Deterministic ASCII charts in the terminal from CSV or JSONL (newline-delimited
JSON) input: bar charts, stacked bars, line charts, and sparklines.

Pure string rendering, zero dependencies, works fully offline. Every chart is a
pure function of its input, so identical input always produces identical output
(making it easy to test and script).

```
$ chartline sales.csv --type bar --width 24
max = 5 (1 char = 0.208333)
jan ██████████████           3
feb ████████████████████████ 5
mar ██████████               2
```

## Install / run

No npm dependencies or build step — `chartline` is a plain Node.js script.
Node.js >= 18 is required.

```sh
# run without installing
node bin/chartline.js data.csv --type line

# or link it into your PATH once
npm link
chartline data.csv --type spark
```

Input is read from a `FILE` argument, or from stdin when no file is given:

```sh
cat data.csv | chartline --type bar
printf '{"x":1,"value":3}\n{"x":2,"value":5}\n' | chartline --type line
```

## Input formats

### CSV

A header row is required. The first column is the label (x), the remaining
columns are numeric series:

```csv
month,apples,oranges
jan,3,1
feb,5,2
mar,2,4
```

Malformed rows (missing columns, non-numeric cells) fail with a row number;
pass `--skip-bad` to drop them instead.

### JSONL

One JSON object per line with a `label` or `x` field plus exactly one numeric
value column:

```jsonl
{"x":1,"value":3}
{"x":2,"value":5}
{"x":3,"value":4}
```

`label` preserves input order and is stringified as-is. Numeric `x` values are
sorted ascending (so line charts read naturally). A file must use `label` or
`x` consistently, and one numeric column throughout — JSONL is single-series;
use CSV for multi-series data.

### `--format auto` (default)

Sniffs by the first non-blank character: `{` or `[` means JSONL, anything else
means CSV.

## Chart types

All examples below are the verbatim, un-edited output of `chartline` against a
`sample.csv` containing exactly the CSV shown in the previous section.

### `--type bar` — one bar per label

```
$ chartline sample.csv --type bar --width 24
max = 5 (1 char = 0.208333)
jan ██████████████           3
feb ████████████████████████ 5
mar ██████████               2
```

Horizontal bars, one line per label. The label column is aligned to the widest
label, the bar column is exactly `--width` characters, and the exact value is
printed after the bar. Bars are scaled by the largest magnitude (`max |value|`,
shown in the header as `1 char = X`). Zeros render as empty bars; negative
values render with their magnitude as a right-aligned bar (the header shows
`min = … max = …` in that case). Equal values render as equal (full-width)
bars. Use `--char` to change the bar character (single rune, default `█`):

```
$ printf 'k,v\non,1\noff,0\n' | chartline --char '#'
max = 1 (1 char = 0.025)
on  ######################################## 1
off                                        0
```

### `--type stacked` — one stacked bar per label

```
$ chartline sample.csv --type stacked --width 24
max = 7 (1 char = 0.291667)
jan ██████████▓▓▓            4
feb █████████████████▓▓▓▓▓▓▓ 7
mar ███████▓▓▓▓▓▓▓▓▓▓▓▓▓▓    6
Legend: █ apples  ▓ oranges
```

Each series gets a distinct block character (palette `█ ▓ ▒ ░ # @ % + x o = ~`,
iterated for more than 12 series) listed in a legend below the bars. Bar length
is the series share of the largest per-row total. Stacked charts are most
meaningful for non-negative values.

### `--type line` — series over the label/x axis

```
$ chartline sample.csv --type line --width 24 --height 7
range = 1 ... 5
          ++++
      ++++    ++       x
  ++++          +++ xxx
++              xxxx+
            xxxx     +++
     xxxxxxx
xxxxx
jan         feb        m
Legend: apples +  oranges x
```

Values are plotted across `--height` rows (`range` header), columns are mapped
from the labels/index (0-based width `--width`), and each series is drawn with
its own marker plus the marker from the series palette `+ x * . o # @ %`:

| series # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|-----------|---|---|---|---|---|---|---|---|
| marker   | `+` | `x` | `*` | `.` | `o` | `#` | `@` | `%` |

Later series are drawn over earlier ones when points collide. A label row below
the plot places labels under their mapped columns (labels are dropped/truncated
when they would overlap). `--width < 2` or `--height < 2` are clamped to 2; a
flat (all-equal) series is plotted on the middle row with the range widened by
1 on each side.

### `--type spark` — one-line sparkline

```
$ chartline sample.csv --type spark
▃█▁
```

Values are mapped onto the 8 block levels `▁▂▃▄▅▆▇█`. Flat values render as
`▄`. `--width` samples longer inputs deterministically (the first chart's
series is used).

For comparison, a line chart from JSONL over stdin:

```
$ printf '{"x":1,"v":2}\n{"x":2,"v":4}\n{"x":3,"v":3}\n' | chartline --type line --height 5 --width 10
range = 2 ... 4
     ++
    +  ++
  ++     +
 +
+
1    2   3
Legend: v +
```

## Options

| flag | description |
|------|-------------|
| `-f, --format <csv\|jsonl\|auto>` | input format (default `auto`) |
| `-t, --type <bar\|stacked\|line\|spark>` | chart type (default `bar`) |
| `--height <n>` | plot height for line charts (default `10`) |
| `-w, --width <n>` | max bar length / chart width (default `40`) |
| `--char <s>` | bar character, single rune (default `█`) |
| `--skip-bad` | skip malformed input rows instead of failing |
| `--json` | print the normalized parsed data as JSON (great for debugging) |
| `--no-color` | disable ANSI colors |
| `-v, --version` | print version |
| `-h, --help` | print help |

Colors are applied only when stdout is a TTY (and `--no-color` / `NO_COLOR`
are absent), so piped output is always plain text.

### Exit codes

| code | meaning |
|------|---------|
| `0` | success |
| `1` | data/input errors: empty input, unreadable file, malformed rows, invalid JSON |
| `2` | usage errors: unknown option, invalid flag value, non-numeric `--height/--width`, multi-character `--char` |

### `--json`

```
$ chartline sample.csv --json
{"labels":["jan","feb","mar"],"series":[{"name":"apples","values":[3,5,2]},{"name":"oranges","values":[1,2,4]}]}
```

Emits the exact normalized structure `{labels, series:[{name, values}]}` that
the chart functions consume.

## Library

The pure functions can be used directly:

```js
import { parseInput } from 'chartline/lib/data.js';
import { barChart, stackedBar, lineChart, sparkline, scaleVals } from 'chartline/lib/charts.js';

const data = parseInput('name,value\na,3\nb,1\n');
console.log(barChart(data, { width: 10 }));
```

- `parseInput(text, {format, skipBad})` → `{labels, series: [{name, values}]}`
- `barChart(data, {width, char})` → string
- `stackedBar(data, {width, char})` → string
- `lineChart(data, {width, height})` → string
- `sparkline(values, {width})` → string
- `scaleVals(values, height)` → `number[]` (min → `0`, max → `height-1`)

## Development

```sh
npm test        # node --test test/*.test.js
```

The test suite compares chart output against exact expected strings (golden
tests), plus input-parsing and CLI end-to-end tests (spawning `bin/chartline.js`
with real files and stdin).

## License

MIT — see [LICENSE](LICENSE). © 2026 Conedope.