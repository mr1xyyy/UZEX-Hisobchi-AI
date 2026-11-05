import { createReadStream } from 'node:fs';

// Streaming RFC-4180 reader, including quoted commas, escaped quotes and newlines.
export async function* readCsv(file) {
  let field = '', row = [], quoted = false, afterQuote = false, header;
  for await (const chunk of createReadStream(file, { encoding: 'utf8' })) {
    for (const ch of chunk) {
      if (quoted) {
        if (ch === '"') { quoted = false; afterQuote = true; }
        else field += ch;
        continue;
      }
      if (afterQuote && ch === '"') { field += '"'; quoted = true; afterQuote = false; continue; }
      if (afterQuote && ![',', '\r', '\n'].includes(ch)) throw new Error('Invalid CSV after quote');
      afterQuote = false;
      if (ch === '"') { if (field) throw new Error('Unexpected CSV quote'); quoted = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') {
        row.push(field); field = '';
        if (!header) header = row.map(h => h.replace(/^\uFEFF/, ''));
        else if (row.some(Boolean)) {
          if (row.length !== header.length) throw new Error('CSV column count mismatch');
          yield Object.fromEntries(header.map((h, i) => [h, row[i]]));
        }
        row = [];
      } else if (ch !== '\r') field += ch;
    }
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  if (field || row.length) {
    row.push(field);
    if (header) {
      if (row.length !== header.length) throw new Error('CSV column count mismatch');
      yield Object.fromEntries(header.map((h, i) => [h, row[i]]));
    }
  }
}
export function number(value) {
  if (String(value ?? '').trim() === '') throw new Error('Missing number');
  const result = Number(String(value).replace(/[\s\u00a0]/g, ''));
  if (!Number.isFinite(result)) throw new Error('Invalid number: ' + value);
  return result;
}
export function date(value) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value || '');
  if (!m) throw new Error('Invalid date: ' + value);
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const parsed = new Date(iso + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new Error('Invalid date: ' + value);
  return iso;
}
