import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { neonConnection, neonQuery, decodeNeonResult } from '../tgcloud/lib/neon_http.js';
import { buildBulkInsert, countQuery } from '../scripts/neon_schema.js';
import { importNeon } from '../scripts/import_neon.js';

const url = 'postgresql://user:encoded%40password@ep-test-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';
test('Neon connection validation allows only Neon hosts and never echoes credentials', () => {
  const config = neonConnection(url);
  assert.equal(config.endpoint, 'https://api.us-east-2.aws.neon.tech/sql');
  assert.doesNotMatch(config.identity, /password/);
  for (const bad of ['postgresql://u:secret@localhost/db', 'postgresql://u:secret@ep-test.neon.tech.evil.test/db', url + '\n']) {
    assert.throws(() => neonConnection(bad), error => !error.message.includes('secret') && !error.message.includes('encoded%40password'));
  }
});
test('Neon HTTP client sends parameterized SQL and decodes raw typed rows', async () => {
  const response = await neonQuery(async (endpoint, options) => {
    assert.equal(endpoint, 'https://api.us-east-2.aws.neon.tech/sql');
    assert.equal(options.headers['Neon-Connection-String'], url);
    assert.equal(options.headers['Neon-Array-Mode'], 'true');
    assert.deepEqual(JSON.parse(options.body), { query: 'SELECT $1', params: ['42'] });
    return { ok: true, json: async () => ({ fields: [
      { name: 'deal_number', dataTypeID: 20 }, { name: 'rate', dataTypeID: 701 },
      { name: 'deal_date', dataTypeID: 1082 }, { name: 'optional', dataTypeID: 701 },
    ], rows: [['42', '12000.5', '2026-01-01', null]] }) };
  }, url, 'SELECT $1', [42]);
  assert.deepEqual(response, [{ deal_number: 42, rate: 12000.5, deal_date: '2026-01-01', optional: null }]);
  assert.throws(() => decodeNeonResult({ fields: [{ name: 'x', dataTypeID: 20 }], rows: [['9007199254740993']] }), /supported range/);
});
test('Neon errors never leak SQL response credentials or the connection string', async () => {
  await assert.rejects(neonQuery(async () => ({ ok: false, status: 400,
    json: async () => ({ code: '28P01', message: 'password is encoded%40password' }),
  }), url, 'SELECT 1'), error => /parol/.test(error.message) && !error.message.includes('encoded%40password'));
  await assert.rejects(neonQuery(async () => ({ ok: false, status: 400,
    json: async () => ({ code: '42P01' }),
  }), url, 'SELECT 1'), /jadvallari topilmadi/);
});
test('Neon bulk insert keeps arbitrary CSV values in a single JSON parameter', () => {
  const value = "'; DROP TABLE uzex.deals; --";
  const statement = buildBulkInsert('contracts', [{ number: '1', currency: 'UZS', data: value }]);
  assert.match(statement.query, /jsonb_to_recordset\(\$1::jsonb\)/);
  assert.match(statement.query, /ON CONFLICT \(number\) DO NOTHING/);
  assert.doesNotMatch(statement.query, /DROP TABLE/);
  assert.equal(JSON.parse(statement.params[0])[0].data, value);
  assert.throws(() => buildBulkInsert('constructor', [{}]), /Invalid Neon batch/);
});
test('Neon import validates counts, checkpoints and marks readiness only after indexes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'uzex-neon-'));
  try {
    await writeFile(join(directory, 'contracts.csv'), 'Номер контракта,Валюта\n1,UZS\n2,USD');
    for (const file of ['participants.csv', 'brokers.csv', 'usd_rates.csv', 'deals_2022.csv']) await writeFile(join(directory, file), 'empty\n');
    const statements = [];
    const actual = { contracts: 2, participants: 0, brokers: 0, usd_rates: 0, deals: 0 };
    const options = { directory, checkpointPath: join(directory, 'progress.json'),
      query: async (sql, params) => {
        statements.push(sql);
        if (sql.includes('jsonb_to_recordset')) assert.equal(JSON.parse(params[0]).length, 2);
        return sql === countQuery ? [actual] : [];
      } };
    assert.deepEqual(await importNeon(options), actual);
    assert.match(statements.at(-1), /value='true'/);
    assert.ok(statements.findIndex(sql => /USING gin/.test(sql)) < statements.length - 2);
    assert.equal(JSON.parse(await readFile(options.checkpointPath, 'utf8')).files['contracts.csv'].count, 2);
    statements.length = 0;
    actual.contracts = 1;
    await assert.rejects(importNeon(options), /yozuv soni mos emas/);
    assert.ok(!statements.some(sql => /value='true'/.test(sql)));
    assert.ok(!statements.some(sql => /jsonb_to_recordset/.test(sql)));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
