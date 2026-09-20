import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../lib/data.js';

test('CSV header row + rows -> normalized data', () => {
  const text = 'name,apples,oranges\nx,1,2\nlonger,3,4\n';
  assert.deepEqual(parseInput(text), {
    labels: ['x', 'longer'],
    series: [
      { name: 'apples', values: [1, 3] },
      { name: 'oranges', values: [2, 4] },
    ],
  });
});

test('CSV tolerates spaces and CRLF line endings', () => {
  const text = 'name, val \r\n x , 1\r\n';
  assert.deepEqual(parseInput(text), {
    labels: ['x'],
    series: [{ name: 'val', values: [1] }],
  });
});

test('CSV cells parse as numbers including negatives and exponent form', () => {
  const text = 'k,v\nn,-2\ne,1e2\n';
  assert.deepEqual(parseInput(text), {
    labels: ['n', 'e'],
    series: [{ name: 'v', values: [-2, 100] }],
  });
});

test('CSV bad numeric cell errors with row number and column', () => {
  const text = 'name,val\na,1\nb,nope\n';
  assert.throws(() => parseInput(text), /row 3: "nope" in column "val" is not a number/);
});

test('CSV row with wrong column count errors with row number', () => {
  const text = 'name,a,b\nx,1\n';
  assert.throws(() => parseInput(text), /row 2: expected 3 columns, got 2/);
});

test('CSV missing label errors', () => {
  const text = 'name,val\n,1\n';
  assert.throws(() => parseInput(text), /row 2: missing label/);
});

test('CSV header with no numeric columns errors', () => {
  const text = 'onlyname\nx\n';
  assert.throws(() => parseInput(text), /header must include a label column/);
});

test('CSV header with no data rows errors', () => {
  assert.throws(() => parseInput('a,b\n'), /header but no data rows/);
});

test('skipBad skips malformed rows', () => {
  const text = 'name,val\na,1\nb,nope\nc,3\n';
  assert.deepEqual(parseInput(text, { skipBad: true }), {
    labels: ['a', 'c'],
    series: [{ name: 'val', values: [1, 3] }],
  });
});

test('skipBad still rejects a useless header', () => {
  assert.throws(() => parseInput('onlyname\nx\n', { skipBad: true }), /header/);
});

test('JSONL label + single numeric column -> normalized data', () => {
  const text = '{"label":"a","value":3}\n{"label":"b","value":-2}\n{"label":"c","value":0}\n';
  assert.deepEqual(parseInput(text), {
    labels: ['a', 'b', 'c'],
    series: [{ name: 'value', values: [3, -2, 0] }],
  });
});

test('JSONL numeric x values are sorted ascending', () => {
  const text = '{"x":3,"v":1}\n{"x":1,"v":3}\n{"x":2,"v":2}\n';
  assert.deepEqual(parseInput(text), {
    labels: ['1', '2', '3'],
    series: [{ name: 'v', values: [3, 2, 1] }],
  });
});

test('JSONL numeric label is stringified, order preserved', () => {
  const text = '{"label":2020,"value":1}\n{"label":2021,"value":2}\n';
  assert.deepEqual(parseInput(text), {
    labels: ['2020', '2021'],
    series: [{ name: 'value', values: [1, 2] }],
  });
});

test('JSONL missing label/x errors', () => {
  assert.throws(() => parseInput('{"n":1}\n'), /line 1: object needs a "label" or "x" field/);
});

test('JSONL without a numeric value column errors', () => {
  assert.throws(() => parseInput('{"label":"a","note":"hi"}\n'), /one numeric value column/);
});

test('JSONL string numbers are not numeric columns', () => {
  assert.throws(() => parseInput('{"label":"a","value":"3"}\n'), /one numeric value column/);
});

test('JSONL with multiple numeric columns errors', () => {
  assert.throws(() => parseInput('{"label":"a","v":1,"w":2}\n'), /multiple numeric columns \(v, w\)/);
});

test('JSONL invalid JSON errors with line number', () => {
  assert.throws(() => parseInput('{"label":"a","v":1}\n{oops\n'), /line 2: invalid JSON/);
});

test('JSONL mixing label and x errors', () => {
  assert.throws(() => parseInput('{"label":"a","v":1}\n{"x":1,"v":2}\n'), /cannot mix "label" and "x"/);
});

test('JSONL inconsistent numeric column errors', () => {
  assert.throws(() => parseInput('{"label":"a","v":1}\n{"label":"b","w":2}\n'), /inconsistent numeric column/);
});

test('JSONL empty label row errors', () => {
  assert.throws(() => parseInput('{"label":"","v":1}\n'), /line 1: empty "label"/);
});

test('JSONL skipBad skips invalid lines', () => {
  const text = '{"label":"a","v":1}\nnot json\n{"label":"b","v":2}\n';
  assert.deepEqual(parseInput(text, { skipBad: true }), {
    labels: ['a', 'b'],
    series: [{ name: 'v', values: [1, 2] }],
  });
});

test('empty and blank-only input errors', () => {
  assert.throws(() => parseInput(''), /empty input/);
  assert.throws(() => parseInput('  \n\n\t '), /empty input/);
});

test('auto-sniff JSONL from leading brace', () => {
  const text = '{ "x": 1, "v": 2 }\n{"x":2,"v":3}\n';
  assert.deepEqual(parseInput(text, { format: 'auto' }), {
    labels: ['1', '2'],
    series: [{ name: 'v', values: [2, 3] }],
  });
});

test('auto-sniff CSV from non-brace first character', () => {
  const text = 'name,val\nx,1\n';
  assert.deepEqual(parseInput(text, { format: 'auto' }), {
    labels: ['x'],
    series: [{ name: 'val', values: [1] }],
  });
});

test('auto-sniff ignores leading blank lines', () => {
  const text = '\n\n{\"x\":1,\"v\":5}\n';
  assert.deepEqual(parseInput(text, { format: 'auto' }), {
    labels: ['1'],
    series: [{ name: 'v', values: [5] }],
  });
});

test('unknown format errors', () => {
  assert.throws(() => parseInput('a,1\n', { format: 'nope' }), /unknown format "nope"/);
});