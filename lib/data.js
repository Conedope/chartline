export function parseInput(text, { format = 'auto', skipBad = false } = {}) {
  if (typeof text !== 'string') throw new Error('input text must be a string');
  const entries = [];
  let first = null;
  const rawLines = text.split('\n');
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].replace(/\r$/, '');
    if (line.trim() === '') continue;
    if (first === null) first = line.trim();
    entries.push({ line: line.trim(), num: i + 1 });
  }
  if (entries.length === 0) throw new Error('empty input: no data rows');
  if (format === 'auto') {
    const c = first[0];
    format = c === '{' || c === '[' ? 'jsonl' : 'csv';
  }
  if (format !== 'csv' && format !== 'jsonl') {
    throw new Error(`unknown format "${format}" (expected csv, jsonl, or auto)`);
  }
  return format === 'csv' ? parseCsv(entries, skipBad) : parseJsonl(entries, skipBad);
}

export function parseNum(cell) {
  const s = cell.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseCsv(entries, skipBad) {
  const header = entries[0].line.split(',').map((s) => s.trim());
  const seriesNames = header.slice(1).map((n, i) => n || `series${i + 1}`);
  if (seriesNames.length < 1) {
    throw new Error(`row ${entries[0].num}: CSV header must include a label column and at least one numeric series column`);
  }
  const expectCols = header.length;
  const labels = [];
  const series = seriesNames.map((name) => ({ name, values: [] }));
  for (let r = 1; r < entries.length; r++) {
    const { line, num } = entries[r];
    const cells = line.split(',').map((s) => s.trim());
    const problem = checkCsvRow(cells, expectCols, header);
    if (problem) {
      if (skipBad) continue;
      throw new Error(`row ${num}: ${problem}`);
    }
    labels.push(cells[0]);
    for (let c = 1; c < expectCols; c++) {
      series[c - 1].values.push(parseNum(cells[c]));
    }
  }
  if (labels.length === 0) throw new Error('CSV input has a header but no data rows');
  return { labels, series };
}

function checkCsvRow(cells, expectCols, header) {
  if (cells.length !== expectCols) return `expected ${expectCols} columns, got ${cells.length}`;
  if (cells[0] === '') return 'missing label';
  for (let c = 1; c < expectCols; c++) {
    const n = parseNum(cells[c]);
    if (n === null) return `"${cells[c]}" in column "${header[c]}" is not a number`;
  }
  return null;
}

function parseJsonl(entries, skipBad) {
  let xMode = null;
  let valueKey = null;
  let numericX = true;
  const rows = [];
  const rawValues = [];
  for (const { line, num } of entries) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      if (skipBad) continue;
      throw new Error(`line ${num}: invalid JSON: ${e.message}`);
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      if (skipBad) continue;
      throw new Error(`line ${num}: expected a JSON object`);
    }
    const hasLabel = Object.prototype.hasOwnProperty.call(obj, 'label');
    const hasX = Object.prototype.hasOwnProperty.call(obj, 'x');
    const key = hasLabel ? 'label' : hasX ? 'x' : null;
    if (key === null) {
      if (skipBad) continue;
      throw new Error(`line ${num}: object needs a "label" or "x" field`);
    }
    if (xMode === null) xMode = key;
    else if (xMode !== key) {
      if (skipBad) continue;
      throw new Error(`line ${num}: cannot mix "label" and "x" fields in one JSONL stream`);
    }
    const valKeys = Object.keys(obj).filter(
      (k) => k !== key && typeof obj[k] === 'number' && Number.isFinite(obj[k])
    );
    if (valKeys.length === 0) {
      if (skipBad) continue;
      throw new Error(`line ${num}: object needs one numeric value column besides "${key}"`);
    }
    if (valKeys.length > 1) {
      if (skipBad) continue;
      throw new Error(`line ${num}: multiple numeric columns (${valKeys.join(', ')}); use CSV for multi-series data`);
    }
    const keyVal = obj[key];
    if (typeof keyVal === 'string' && keyVal.trim() === '') {
      if (skipBad) continue;
      throw new Error(`line ${num}: empty "${key}"`);
    }
    if (valueKey === null) valueKey = valKeys[0];
    else if (valueKey !== valKeys[0]) {
      if (skipBad) continue;
      throw new Error(`line ${num}: inconsistent numeric column "${valKeys[0]}" (expecting "${valueKey}")`);
    }
    if (typeof keyVal !== 'number') numericX = false;
    rows.push({ keyVal, label: String(keyVal) });
    rawValues.push(obj[valueKey]);
  }
  if (rows.length === 0) throw new Error('JSONL input has no usable rows');
  let order = rows.map((_, i) => i);
  if (xMode === 'x' && numericX) order.sort((a, b) => rows[a].keyVal - rows[b].keyVal);
  return {
    labels: order.map((i) => rows[i].label),
    series: [{ name: valueKey, values: order.map((i) => rawValues[i]) }],
  };
}