import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { writeFile } from 'node:fs/promises';
import { importData, fetchWithRetry, safeServerDescription } from './import_data.js';
import { neonTables } from './neon_schema.js';
import { compilePlan } from '../tgcloud/lib/query_plan.js';
import { neonQuery } from '../tgcloud/lib/neon_http.js';

const cases = [
  { name: '2024 top buyer', plan: { action: 'group', metric: 'amount_uzs', groupBy: 'buyer', filters: { dateFrom: '2024-01-01', dateTo: '2025-01-01' }, limit: 1 } },
  { name: '2025 Samarqand wheat tonnes', plan: { action: 'sum', metric: 'volume', outputUnit: 'тонна', filters: { terms: ['пшениц'], region: 'samarqand', dateFrom: '2025-01-01', dateTo: '2026-01-01' } } },
  { name: '2025 grade-1 raw cotton UZS/kg', plan: { action: 'average', metric: 'unit_price_uzs', outputUnit: 'килограмм', filters: { terms: ['хлопок', 'сырец'], grade: '1', dateFrom: '2025-01-01', dateTo: '2026-01-01' } } },
  { name: '2025 export amount share', plan: { action: 'share', metric: 'amount_uzs', filters: { dateFrom: '2025-01-01', dateTo: '2026-01-01' } } },
  { name: '2023 Namangan count', plan: { action: 'count', filters: { region: 'namangan', dateFrom: '2023-01-01', dateTo: '2024-01-01' } } },
];
let sqlite;
async function main() {
  const postgres = process.argv.includes('--neon');
  if (!postgres) {
    sqlite = new DatabaseSync(':memory:');
    const statements = new Map();
    for (const [key, table] of Object.entries(neonTables)) {
      sqlite.exec(`CREATE TABLE ${table.name} (${table.columns.map(([, column, type]) => `${column} ${type}${column === table.primary ? ' PRIMARY KEY' : ''}`).join(',')})`);
      statements.set(key, sqlite.prepare(`INSERT INTO ${table.name} (${table.columns.map(([, column]) => column).join(',')}) VALUES (${table.columns.map(() => '?').join(',')})`));
    }
    await importData({ directory: process.argv.find(arg => arg.endsWith('uzex_spot_data')) || '../uzex_spot_data', spotOnly: false, batchSize: 1000, maxBatchBytes: 1000000,
      run: async input => {
        if (input.action) return { fts: false };
        sqlite.exec('BEGIN');
        try {
          const table = neonTables[input.table], insert = statements.get(input.table);
          for (const row of input.rows) insert.run(...table.columns.map(([key]) => row[key] ?? null));
          sqlite.exec('COMMIT');
        } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        return { processed: input.rows.length };
      } });
  }
  const results = [];
  for (const item of cases) {
    const sql = compilePlan(item.plan, postgres);
    const rows = postgres ? await neonQuery((url, options) => fetchWithRetry(url, options, { serviceName: 'Neon' }), process.env.DATABASE_URL, sql.query, sql.params)
      : sqlite.prepare(sql.query).all(sql.params);
    results.push({ name: item.name, ...rows[0] });
  }
  assert.equal(results[0].group_value, '983531029');
  assert.equal(Math.round(results[0].value), 1169958734081);
  assert.equal(results[1].value, 36943); assert.equal(Number(results[1].matched), 143);
  assert.equal(Number(results[2].value.toFixed(2)), 9755.48); assert.equal(Number(results[2].matched), 13407);
  assert.equal(Number(results[3].value.toFixed(2)), 4.87);
  assert.equal(results[4].value, 11346);
  await writeFile('REGRESSION_RESULTS.json', JSON.stringify({ backend: postgres ? 'neon' : 'local SQLite built from CSV', results }, null, 2));
  console.table(results.map(r => ({ question: r.name, value: r.value, matched: r.matched, company: r.group_name })));
  console.log('All five reference results matched actual compiled SQL.');
}
main().catch(error => { console.error(safeServerDescription(error.message)); process.exitCode = 1; }).finally(() => sqlite?.close());
