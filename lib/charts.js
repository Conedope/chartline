export const STACK_CHARS = ['█', '▓', '▒', '░', '#', '@', '%', '+', 'x', 'o', '=', '~'];
export const MARKERS = ['+', 'x', '*', '.', 'o', '#', '@', '%'];
export const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const COLOR_CODES = ['36', '35', '33', '32', '34', '31'];

export function fmt(n) {
  if (Number.isInteger(n)) return String(n);
  let s = n.toFixed(6);
  if (s.includes('e')) return s;
  s = s.replace(/0+$/, '');
  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

export function clampInt(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function maybeColor(colors, idx, s) {
  if (!colors) return s;
  return `\x1b[${COLOR_CODES[idx % COLOR_CODES.length]}m${s}\x1b[0m`;
}

function requireSeries(data) {
  if (!data || !Array.isArray(data.series) || data.series.length === 0) {
    throw new Error('chart needs at least one series');
  }
}

export function scaleVals(values, height) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const range = mx - mn;
  if (range === 0) return values.map(() => Math.floor(height / 2));
  return values.map((v) => Math.round(((v - mn) / range) * (height - 1)));
}

export function barChart(data, { width = 40, height, char = '█', colors = false } = {}) {
  requireSeries(data);
  const W = clampInt(width, 1, 200);
  const series = data.series[0];
  const values = series.values;
  const labels = data.labels;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const scale = Math.max(Math.abs(mn), Math.abs(mx));
  const per = scale > 0 ? scale / W : 0;
  const header =
    mn >= 0
      ? `max = ${fmt(mx)} (1 char = ${fmt(per)})`
      : `min = ${fmt(mn)} max = ${fmt(mx)} (1 char = ${fmt(per)})`;
  const labelW = Math.max(...labels.map((l) => l.length)) + 1;
  const lines = [header];
  for (let i = 0; i < labels.length; i++) {
    const v = values[i];
    const len = scale > 0 ? Math.round((Math.abs(v) / scale) * W) : 0;
    const run = len > 0 ? maybeColor(colors, 0, char.repeat(len)) : '';
    const bar = v >= 0 ? run + ' '.repeat(W - len) : ' '.repeat(W - len) + run;
    lines.push(labels[i].padEnd(labelW) + bar + ' ' + fmt(v));
  }
  return lines.join('\n');
}

export function stackedBar(data, { width = 40, height, char, colors = false } = {}) {
  requireSeries(data);
  const W = clampInt(width, 1, 200);
  const palette = STACK_CHARS.slice();
  if (char) palette[0] = char;
  const totals = data.labels.map((_, i) => data.series.reduce((a, s) => a + s.values[i], 0));
  const maxT = Math.max(...totals, 0);
  const per = maxT > 0 ? maxT / W : 0;
  const labelW = Math.max(...data.labels.map((l) => l.length)) + 1;
  const lines = [`max = ${fmt(maxT)} (1 char = ${fmt(per)})`];
  for (let i = 0; i < data.labels.length; i++) {
    let used = 0;
    const lens = [];
    for (const s of data.series) {
      const len = maxT > 0 ? Math.min(Math.round((Math.abs(s.values[i]) / maxT) * W), W - used) : 0;
      lens.push(len);
      used += len;
    }
    let bar = '';
    let start = 0;
    for (let si = 0; si < lens.length; si++) {
      bar += maybeColor(colors, si, palette[si % palette.length].repeat(lens[si]));
      start += lens[si];
    }
    if (!colors) bar = bar.padEnd(W);
    else if (start < W) bar += ' '.repeat(W - start);
    lines.push(data.labels[i].padEnd(labelW) + bar + ' ' + fmt(totals[i]));
  }
  lines.push(`Legend: ${data.series.map((s, si) => `${palette[si % palette.length]} ${s.name}`).join('  ')}`);
  return lines.join('\n');
}

export function lineChart(data, { width = 40, height = 10, colors = false } = {}) {
  requireSeries(data);
  const W = clampInt(width, 2, 300);
  const H = clampInt(height, 2, 60);
  const n = data.labels.length;
  if (n === 0) return '';
  const colFor = (i) => (n === 1 ? 0 : Math.round((i / (n - 1)) * (W - 1)));
  const all = [];
  for (const s of data.series) for (const v of s.values) all.push(v);
  let mn = Math.min(...all);
  let mx = Math.max(...all);
  if (mn === mx) {
    mn -= 1;
    mx += 1;
  }
  const rowFor = (v) => H - 1 - Math.round(((v - mn) / (mx - mn)) * (H - 1));
  const grid = Array.from({ length: H }, () => Array(W).fill(' '));
  data.series.forEach((series, si) => {
    const marker = MARKERS[si % MARKERS.length];
    const put = (r, c) => {
      grid[r][c] = maybeColor(colors, si, marker);
    };
    for (let i = 0; i < n; i++) {
      const c0 = colFor(i);
      const v0 = series.values[i];
      if (i + 1 < n) {
        const c1 = colFor(i + 1);
        const v1 = series.values[i + 1];
        if (c1 > c0) {
          for (let c = c0; c <= c1; c++) {
            const t = (c - c0) / (c1 - c0);
            put(rowFor(v0 + t * (v1 - v0)), c);
          }
        } else {
          put(rowFor(v0), c0);
        }
      } else {
        put(rowFor(v0), c0);
      }
    }
  });
  const lines = grid.map((row) => row.join('').trimEnd());
  lines.unshift(`range = ${fmt(mn)} ... ${fmt(mx)}`);
  lines.push(axisRow(n, colFor, data.labels, W));
  lines.push(`Legend: ${data.series.map((s, si) => `${s.name} ${MARKERS[si % MARKERS.length]}`).join('  ')}`);
  return lines.join('\n');
}

function axisRow(n, colFor, labels, W) {
  const row = new Array(W).fill(' ');
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const c = colFor(i);
    if (c < cursor) continue;
    const room = W - c;
    if (room <= 0) continue;
    const shown = labels[i].slice(0, room);
    for (let k = 0; k < shown.length; k++) row[c + k] = shown[k];
    cursor = c + shown.length;
  }
  return row.join('').trimEnd();
}

export function sparkline(values, { width, char, colors = false } = {}) {
  if (!Array.isArray(values) || values.length === 0) return '';
  const n = values.length;
  const W = width ? clampInt(width, 1, 1000) : n;
  let idxs;
  if (W === 1) {
    idxs = [n - 1];
  } else if (n <= W) {
    idxs = values.map((_, i) => i);
  } else {
    const seen = new Set();
    idxs = [];
    for (let i = 0; i < W; i++) {
      const ix = Math.round((i / (W - 1)) * (n - 1));
      if (!seen.has(ix)) {
        seen.add(ix);
        idxs.push(ix);
      }
    }
  }
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const range = mx - mn;
  return idxs
    .map((i) => {
      const v = values[i];
      if (range === 0) return SPARK_CHARS[3];
      const k = Math.round(((v - mn) / range) * (SPARK_CHARS.length - 1));
      return SPARK_CHARS[k];
    })
    .join('');
}