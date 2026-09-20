import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleVals, fmt, barChart, stackedBar, lineChart, sparkline } from '../lib/charts.js';

test('fmt formats numbers compactly', () => {
  assert.equal(fmt(0.3), '0.3');
  assert.equal(fmt(0.94), '0.94');
  assert.equal(fmt(9.4), '9.4');
  assert.equal(fmt(-2), '-2');
  assert.equal(fmt(0), '0');
  assert.equal(fmt(1 / 3), '0.333333');
  assert.equal(fmt(1e21), '1e+21');
});

test('scaleVals maps min to 0 and max to height-1', () => {
  assert.deepEqual(scaleVals([0, 5, 10], 11), [0, 5, 10]);
});

test('scaleVals scales relative values', () => {
  assert.deepEqual(scaleVals([1, 3, 2], 5), [0, 4, 2]);
});

test('scaleVals places flat values at mid-range', () => {
  assert.deepEqual(scaleVals([10, 10, 10], 4), [2, 2, 2]);
});

test('barChart golden output: positive, negative, and zero values', () => {
  const data = { labels: ['a', 'b', 'c'], series: [{ name: 'v', values: [3, -2, 0] }] };
  const expected = [
    'min = -2 max = 3 (1 char = 0.3)',
    'a ██████████ 3',
    'b    ███████ -2',
    'c            0',
  ].join('\n');
  assert.equal(barChart(data, { width: 10, char: '█' }), expected);
});

test('barChart aligns labels of differing widths and right-pads the value column', () => {
  const data = { labels: ['x', 'longer'], series: [{ name: 'v', values: [1, 2] }] };
  const expected = [
    'max = 2 (1 char = 0.2)',
    'x      █████      1',
    'longer ██████████ 2',
  ].join('\n');
  assert.equal(barChart(data, { width: 10 }), expected);
});

test('barChart all-zero values renders empty bars with a zero scale', () => {
  const data = { labels: ['a', 'b'], series: [{ name: 'v', values: [0, 0] }] };
  const expected = ['max = 0 (1 char = 0)', 'a            0', 'b            0'].join('\n');
  assert.equal(barChart(data, { width: 10 }), expected);
});

test('barChart negative-only values scale by largest magnitude', () => {
  const data = { labels: ['a', 'b'], series: [{ name: 'v', values: [-3, -1] }] };
  const expected = [
    'min = -3 max = -1 (1 char = 0.3)',
    'a ██████████ -3',
    'b        ███ -1',
  ].join('\n');
  assert.equal(barChart(data, { width: 10 }), expected);
});

test('barChart equal-max values render as full-width bars', () => {
  const data = { labels: ['a', 'b'], series: [{ name: 'v', values: [5, 5] }] };
  const expected = [
    'max = 5 (1 char = 0.5)',
    'a ██████████ 5',
    'b ██████████ 5',
  ].join('\n');
  assert.equal(barChart(data, { width: 10 }), expected);
});

test('barChart honors a custom bar character', () => {
  const data = { labels: ['a', 'b'], series: [{ name: 'v', values: [1, 2] }] };
  const expected = ['max = 2 (1 char = 0.4)', 'a ###   1', 'b ##### 2'].join('\n');
  assert.equal(barChart(data, { width: 5, char: '#' }), expected);
});

test('stackedBar golden output for 2 series with legend', () => {
  const data = {
    labels: ['p', 'q'],
    series: [
      { name: 'apples', values: [1, 2] },
      { name: 'oranges', values: [2, 3] },
    ],
  };
  const expected = [
    'max = 5 (1 char = 0.5)',
    'p ██▓▓▓▓     3',
    'q ████▓▓▓▓▓▓ 5',
    'Legend: █ apples  ▓ oranges',
  ].join('\n');
  assert.equal(stackedBar(data, { width: 10 }), expected);
});

test('lineChart golden output for 2 short series with markers and legend', () => {
  const data = {
    labels: ['a', 'b', 'c'],
    series: [
      { name: 'alpha', values: [1, 3, 2] },
      { name: 'beta', values: [3, 1, 2] },
    ],
  };
  const expected = [
    'range = 1 ... 3',
    'x    ++',
    ' x  +  ++',
    '  xx    xx',
    ' +  x xx',
    '+    x',
    'a    b   c',
    'Legend: alpha +  beta x',
  ].join('\n');
  assert.equal(lineChart(data, { width: 10, height: 5 }), expected);
});

test('lineChart clamps tiny width and height to a 2x2 plot', () => {
  const data = { labels: ['a', 'b', 'c'], series: [{ name: 'v', values: [1, 2, 3] }] };
  const expected = [
    'range = 1 ... 3',
    ' +',
    '+',
    'ab',
    'Legend: v +',
  ].join('\n');
  assert.equal(lineChart(data, { width: 1, height: 1 }), expected);
});

test('lineChart flattens an all-equal series to the middle row', () => {
  const data = { labels: ['a', 'b'], series: [{ name: 'v', values: [5, 5] }] };
  const expected = ['range = 4 ... 6', '', '+++', '', 'a b', 'Legend: v +'].join('\n');
  assert.equal(lineChart(data, { width: 3, height: 3 }), expected);
});

test('sparkline maps 8 values onto the 8 block levels', () => {
  assert.equal(sparkline([1, 2, 3, 4, 5, 6, 7, 8]), '▁▂▃▄▅▆▇█');
});

test('sparkline renders flat values as the mid block', () => {
  assert.equal(sparkline([3, 3, 3]), '▄▄▄');
});

test('sparkline width samples long inputs deterministically', () => {
  assert.equal(sparkline([0, 0, 10, 10], { width: 2 }), '▁█');
});

test('sparkline descending values map levels too', () => {
  assert.equal(sparkline([8, 7, 6, 5, 4, 3, 2, 1]), '█▇▆▅▄▃▂▁');
});