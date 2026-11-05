import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner, managementError, safeServerDescription, networkError, fetchWithRetry, importData } from '../scripts/import_data.js';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('configuration diagnostics distinguish missing token and invalid token', async () => {
  const previous = process.env.TGCLOUD_TOKEN;
  try {
    delete process.env.TGCLOUD_TOKEN;
    await assert.rejects(createRunner(), /TGCLOUD_TOKEN belgilanmagan/);
    process.env.TGCLOUD_TOKEN = '123:telegram-secret';
    await assert.rejects(createRunner(), /formati noto‘g‘ri/);
  } finally {
    if (previous === undefined) delete process.env.TGCLOUD_TOKEN;
    else process.env.TGCLOUD_TOKEN = previous;
  }
});
test('server error diagnostics classify failures without exposing response secrets', () => {
  assert.match(managementError(401, {}).message, /qabul qilinmadi/);
  assert.match(managementError(400, { description: 'no such table: settings' }).message, /migrate/);
  assert.match(managementError(429, {}).message, /limit/);
  const error = managementError(500, { description: 'unexpected sk-secret app123:secret' });
  assert.doesNotMatch(error.message, /sk-secret|app123:secret/);
  assert.match(error.message, /HTTP 500/);
  assert.match(managementError(400, { description: 'Module must have a default export' }).message, /default export/);
});
test('server descriptions redact exact environment secrets and preserve useful errors', () => {
  const previous = process.env.DEEPSEEK_API_KEY;
  try {
    process.env.DEEPSEEK_API_KEY = 'custom-private-key';
    const result = safeServerDescription('Invalid module; custom-private-key Bearer opaque-token sk-secret app123:token');
    assert.match(result, /Invalid module/);
    assert.doesNotMatch(result, /custom-private-key|opaque-token|sk-secret|app123:token/);
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  }
});
test('network diagnostics show codes without error messages or credentials', () => {
  const dns = networkError({ name: 'TypeError', message: 'secret-token', cause: { code: 'ENOTFOUND' } });
  assert.match(dns.message, /ENOTFOUND.*DNS/);
  assert.doesNotMatch(dns.message, /secret-token/);
  assert.match(networkError({ name: 'TimeoutError' }).message, /vaqti tugadi/);
  assert.match(networkError({ cause: { code: 'CERT_HAS_EXPIRED' } }).message, /TLS sertifikat/);
});
test('management run uses a valid Telegram handler name and ephemeral import code', async () => {
  const previousToken = process.env.TGCLOUD_TOKEN;
  const previousFetch = globalThis.fetch;
  let payload;
  try {
    process.env.TGCLOUD_TOKEN = 'app123:test-only';
    globalThis.fetch = async (url, options) => {
      payload = JSON.parse(options.body);
      assert.equal(url, 'https://cloud.telegram.org/app123/manage/run');
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { result: { configured: true } } }) };
    };
    const run = await createRunner();
    assert.deepEqual(await run({ action: 'configure', apiKey: 'test-only' }), { configured: true });
    assert.equal(payload.module, 'handlers/message');
    assert.match(payload.sources['handlers/message'], /importBatch/);
    assert.equal(Object.hasOwn(payload.sources, 'handlers/import_data'), false);
    const { readFile } = await import('node:fs/promises');
    const original = await readFile(new URL('../tgcloud/handlers/message.js', import.meta.url), 'utf8');
    assert.match(original, /searchRegistry/);
    assert.doesNotMatch(original, /importBatch/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.TGCLOUD_TOKEN;
    else process.env.TGCLOUD_TOKEN = previousToken;
  }
});
test('connect timeouts retry with backoff and preserve request body', async () => {
  let calls = 0;
  const delays = [];
  const response = await fetchWithRetry('https://example.test', { body: 'same-batch' }, {
    fetchFn: async (url, options) => {
      assert.equal(options.body, 'same-batch');
      if (++calls < 3) throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
      return { ok: true, status: 200, text: async () => '{"ok":true}' };
    }, sleep: async ms => delays.push(ms), warn: () => {},
  });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
  assert.deepEqual(await response.json(), { ok: true });
});
test('retries stop after four attempts and do not retry TLS errors', async () => {
  let calls = 0;
  const options = { fetchFn: async () => { calls++; throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); }, sleep: async () => {}, warn: () => {} };
  await assert.rejects(fetchWithRetry('https://example.test', {}, options));
  assert.equal(calls, 4);
  calls = 0;
  options.fetchFn = async () => { calls++; throw new TypeError('TLS failed', { cause: { code: 'CERT_HAS_EXPIRED' } }); };
  await assert.rejects(fetchWithRetry('https://example.test', {}, options));
  assert.equal(calls, 1);
});
test('HTTP 429 honors Retry-After and retries the same batch', async () => {
  let calls = 0;
  const delays = [];
  const response = await fetchWithRetry('https://example.test', { body: 'same-batch' }, {
    fetchFn: async (url, options) => {
      assert.equal(options.body, 'same-batch');
      calls++;
      return calls === 1
        ? { status: 429, ok: false, headers: { get: () => '75' }, text: async () => '{"ok":false}' }
        : { status: 200, ok: true, text: async () => '{"ok":true}' };
    }, sleep: async ms => delays.push(ms), warn: () => {},
  });
  assert.equal(response.status, 200);
  assert.deepEqual(delays, [60000, 15000]);
  assert.equal(calls, 2);
});
test('restart skips confirmed batches and resumes the failed batch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'uzex-resume-'));
  const checkpointPath = join(directory, 'progress.json');
  try {
    await writeFile(join(directory, 'contracts.csv'), 'Номер контракта,Валюта\n' + Array.from({ length: 601 }, (_, i) => `${i + 1},UZS`).join('\n'));
    for (const file of ['participants.csv', 'brokers.csv', 'usd_rates.csv', 'deals_2022.csv']) await writeFile(join(directory, file), 'empty\n');
    let calls = 0;
    await assert.rejects(importData({ directory, checkpointPath, run: async input => {
      if (++calls === 2) throw new Error('simulated outage');
      return { processed: input.rows.length };
    } }), /simulated outage/);
    assert.equal(JSON.parse(await readFile(checkpointPath, 'utf8')).files['contracts.csv'].count, 300);
    const uploaded = [];
    await importData({ directory, checkpointPath, run: async input => {
      if (input.action) return { fts: true };
      uploaded.push(...input.rows.map(row => row.number));
      return { processed: input.rows.length };
    } });
    assert.equal(uploaded[0], '301');
    assert.equal(uploaded.length, 301);
    assert.equal(JSON.parse(await readFile(checkpointPath, 'utf8')).files['contracts.csv'].count, 601);
    await writeFile(join(directory, 'contracts.csv'), 'Номер контракта,Валюта\n1,USD');
    await assert.rejects(importData({ directory, checkpointPath, run: async () => assert.fail('must not upload changed CSV') }), /o‘zgargan/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
