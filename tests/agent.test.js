import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCsv, number, date } from '../scripts/csv.js';
import { normalize, calculateDeal, NO_ANSWER, queryTerms } from '../tgcloud/lib/normalize.js';
import { productGrade } from '../tgcloud/lib/registry_dimensions.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE deals (deal_number INTEGER PRIMARY KEY, deal_date TEXT, product_name TEXT,
 search_text TEXT, quantity INTEGER, lot INTEGER, total_amount REAL, contract_type TEXT, currency TEXT,
 seller_inn TEXT,buyer_inn TEXT,seller_broker TEXT,buyer_broker TEXT,unit TEXT,status TEXT,contract_number TEXT,
 product_grade TEXT,region TEXT,trade_form TEXT);
 CREATE TABLE usd_rates(date TEXT PRIMARY KEY,rate REAL);
 CREATE TABLE participants(inn TEXT PRIMARY KEY,name TEXT);
 CREATE TABLE brokers(code TEXT PRIMARY KEY,name TEXT);
 CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);`);
let calls = 0, sent = [], request;
let neonResponses = [], neonCalls = 0;
let lastNeonRequest;
let plannerPlan = { action: 'list', filters: { terms: ['1 сорт'] } };
const callbackAnswers = [], editedMessages = [], commandMenus = [];
globalThis.__testSDK = {
  db: { get: async (q, p = {}) => sqlite.prepare(q).get(p), all: async (q, p = {}) => sqlite.prepare(q).all(p),
    run: async (q, p = {}) => sqlite.prepare(q).run(p) },
  api: { sendMessage: async value => { sent.push(value); return value; },
    answerCallbackQuery: async value => { callbackAnswers.push(value); },
    editMessageText: async value => { editedMessages.push(value); },
    setMyCommands: async value => { commandMenus.push(value); return true; } },
  fetch: async (url, options) => {
    if (url.includes('.neon.tech/sql')) {
      lastNeonRequest = JSON.parse(options.body);
      neonCalls++;
      const result = neonResponses.shift();
      if (!result) throw new Error('Unexpected Neon request');
      return result;
    }
    calls++; request = { url, ...JSON.parse(options.body) };
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: request.response_format ? JSON.stringify(plannerPlan) : 'Sun’iy ma’lumot: bitim 1, hajm 20.' } }] }) };
  },
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'sdk') return { shortCircuit: true, url: 'data:text/javascript,export const {db,api,fetch} = globalThis.__testSDK;' };
  return next(specifier, context);
} });
const { default: handler } = await import('../tgcloud/handlers/message.js');
const { searchRegistry } = await import('../tgcloud/lib/rag_search.js');
const { askDeepSeek } = await import('../tgcloud/lib/deepseek.js');
const { parseCountQuery, answerRegistryCount } = await import('../tgcloud/lib/registry_count.js');

test('zero matches and non-text updates never call DeepSeek', async () => {
  sent = []; calls = 0;
  await handler({ chat: { id: 1 }, text: 'unknown-product' });
  assert.match(sent[0].text, /reyestrda hozircha bitimlar yo‘q/); assert.equal(calls, 0);
  await handler({ chat: { id: 1 }, photo: [] });
  assert.equal(sent.length, 1);
  assert.equal(await askDeepSeek('x', '{"records":[]}'), NO_ANSWER);
  assert.equal(calls, 0);
});
test('profit questions give a useful explanation without database estimates or model calls', async () => {
  const before = calls;
  await handler({ chat: { id: 1 }, text: '2025-yilda eng ko‘p foyda ko‘rgan kompaniya' });
  assert.match(sent.at(-1).text, /xarajatlari va mahsulot tannarxi yo‘q/);
  assert.match(sent.at(-1).text, /2025-yilda bitimlar summasi/);
  assert.equal(calls, before);
});
test('Neon backend preserves zero-result guardrail and does not fall back to SQLite', async () => {
  sqlite.exec("INSERT INTO deals (deal_number,search_text) VALUES (777,'1 сорт')");
  sqlite.prepare('INSERT INTO settings VALUES (?,?)').run('neon_database_url', 'postgresql://u:p@ep-test.us-east-2.aws.neon.tech/db');
  try {
    calls = 0; neonCalls = 0; sent = [];
    neonResponses = [{ ok: true, json: async () => ({ fields: [], rows: [] }) }];
    await handler({ chat: { id: 1 }, text: '1-sorta' });
    assert.equal(neonCalls, 1);
    assert.equal(calls, 0);
    assert.match(sent[0].text, /mos yozuv reyestrdan topilmadi/);
    neonResponses = [{ ok: true, json: async () => ({
      fields: [{ name: 'deal_number', dataTypeID: 20 }, { name: 'quantity', dataTypeID: 20 },
        { name: 'lot', dataTypeID: 20 }, { name: 'total_amount', dataTypeID: 701 },
        { name: 'currency', dataTypeID: 25 }, { name: 'usd_rate', dataTypeID: 701 }],
      rows: [['99', '2', '10', '100', 'USD', '12000']],
    }) }];
    const result = await searchRegistry('1-sorta');
    const row = JSON.parse(result.context).records[0];
    assert.equal(row.deal_number, 99); assert.equal(row.unit_price_uzs, 60000);
    neonResponses = [{ ok: false, status: 500, json: async () => ({ code: 'XX000' }) }];
    await handler({ chat: { id: 1 }, text: '1-sorta' });
    assert.match(sent.at(-1).text, /vaqtinchalik/);
    assert.equal(calls, 0);
  } finally { sqlite.exec("DELETE FROM settings WHERE key='neon_database_url'; DELETE FROM deals WHERE deal_number=777;"); }
});
test('real SQLite LIKE, joins, grades, UTF-8, identifiers and injection', async () => {
  sqlite.exec("INSERT INTO usd_rates VALUES ('2026-01-01',12000); INSERT INTO settings VALUES ('deepseek_api_key','test-only');");
  const search = normalize('МУКА 1-сорта 123456789 BK001');
  sqlite.prepare('INSERT INTO deals (deal_number,deal_date,product_name,search_text,quantity,lot,total_amount,contract_type,currency,seller_inn,buyer_inn,seller_broker,buyer_broker) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)').run('2026-01-01', 'МУКА 1-сорта', search, 2, 10, 100, 'Экспортный', 'USD', '123456789', '987654321', 'BK001', 'BK002');
  sqlite.exec("UPDATE deals SET unit='тонна',product_grade='1',trade_form='Спот',region='namangan' WHERE deal_number=1");
  const result = await searchRegistry('1-sorta');
  assert.equal(result.found, true);
  const row = JSON.parse(result.context).records[0];
  assert.equal(row.volume, 20); assert.equal(row.unit_price, 5);
  assert.equal(row.total_uzs, 1200000); assert.equal(row.unit_price_uzs, 60000);
  for (const query of ['мука', 'un', '123456789', 'BK001']) assert.equal((await searchRegistry(query)).found, true);
  assert.equal((await searchRegistry("%' OR 1=1 --")).found, false);
  await handler({ chat: { id: 1 }, text: '1-sorta haqida malumot bering' });
  assert.equal(calls, 1); assert.equal(request.temperature, 0);
  assert.match(sent.at(-1).text, /Bitim №1/);
  assert.equal(request.model, 'deepseek-flash'); assert.match(request.url, /^https:\/\/api\.deepseek\.com\//);
});
test('bare grade lookup renders sourced rows without asking DeepSeek', async () => {
  const before = calls;
  await handler({ chat: { id: 1 }, text: '1-sorta' });
  const answer = sent.at(-1).text;
  assert.match(answer, /Bitim №1/);
  assert.match(answer, /МУКА 1-сорта/);
  assert.match(answer, /60 000 so‘m/);
  assert.doesNotMatch(answer, /sun’iy|Manba:/);
  assert.notEqual(answer, NO_ANSWER);
  assert.equal(calls, before);
});
test('FTS5 search and substring LIKE fallback both return registry rows', async () => {
  sqlite.exec("CREATE VIRTUAL TABLE deals_fts USING fts5(search_text, content='deals', content_rowid='deal_number'); INSERT INTO deals_fts(deals_fts) VALUES('rebuild');");
  assert.equal((await searchRegistry('мука')).found, true);
  assert.equal((await searchRegistry('ука')).found, true);
  assert.equal((await searchRegistry('nonexistent')).found, false);
});
test('management diagnostics report routing and search without exposing settings or calling the model', async () => {
  const { default: diagnose } = await import('../tgcloud/lib/diagnostics.js');
  const before = calls;
  const result = await diagnose({ query: '1-sorta' });
  assert.equal(result.backend, 'sqlite');
  assert.equal(result.deepseekConfigured, true);
  assert.equal(result.found, true);
  assert.equal(result.matchesInContext, 1);
  assert.deepEqual(result.terms, ['1 сорт']);
  assert.equal(calls, before);
  assert.doesNotMatch(JSON.stringify(result), /test-only|postgresql:\/\//);
});
test('grade phrase excludes unrelated digits, other grades and class numbers', async () => {
  const fixtures = [
    [201, 'Хлопок Сорт I сорт Класс II класс'],
    [202, 'Хлопок Сорт третий сорт Класс 1-класс'],
    [203, 'Хлопок Сорт 2 сорт Класс 2-класс'],
    [204, 'Хлопок Сорт 11-сорта'],
    [205, 'Хлопок сорт 1'],
  ];
  try {
    for (const [id, product] of fixtures) sqlite.prepare('INSERT INTO deals (deal_number,product_name,search_text) VALUES (?,?,?)')
      .run(id, product, normalize(product + ' 123456789 BK001'));
    for (const [id, product] of fixtures) sqlite.prepare('UPDATE deals SET product_grade=? WHERE deal_number=?').run(productGrade(product), id);
    assert.deepEqual(queryTerms('1-sorta'), ['1 сорт']);
    assert.deepEqual(queryTerms('I сорт'), ['1 сорт']);
    assert.deepEqual(queryTerms('сорт 1'), ['1 сорт']);
    const result = await searchRegistry('1-sorta');
    const ids = JSON.parse(result.context).records.map(row => row.deal_number);
    assert.ok(ids.includes(1)); assert.ok(ids.includes(201)); assert.ok(ids.includes(205));
    for (const id of [202, 203, 204]) assert.ok(!ids.includes(id));
    const { buildNeonSearch } = await import('../tgcloud/lib/neon_search.js');
    const neon = buildNeonSearch(queryTerms('1-sorta'));
    assert.deepEqual(neon.params, ['1']);
    assert.match(neon.query, /d\.product_grade = \$1/);
    assert.ok(!neon.params.includes('%1%'));
  } finally { sqlite.exec('DELETE FROM deals WHERE deal_number BETWEEN 201 AND 205'); }
});
test('yearly count uses all matching SQLite rows and bypasses the model', async () => {
  try {
    for (let i = 0; i < 25; i++) sqlite.prepare('INSERT INTO deals (deal_number,deal_date) VALUES (?,?)').run(300 + i, '2025-06-01');
    sqlite.exec("INSERT INTO deals (deal_number,deal_date) VALUES (325,'2024-12-31'),(326,'2026-01-01')");
    const before = calls;
    await handler({ chat: { id: 1 }, text: '2025-yilda nechta bitim bo‘lgan?' });
    assert.match(sent.at(-1).text, /2025-yilda reyestrda 25 ta bitim/);
    assert.equal(calls, before);
    assert.equal(await answerRegistryCount('2030-yilda nechta bitim bolgan?'), NO_ANSWER);
    assert.deepEqual(parseCountQuery('Сколько сделок было в 2025 году?'), { year: 2025, language: 'ru' });
    for (const unsupported of ['2025-yilda nechta paxta bitim bolgan?', '2025-yilda nechta bekor qilingan bitim bolgan?', '2024 va 2025 yilda nechta bitim bolgan?', '2025-yilda eng arzon bitim qancha?']) assert.equal(parseCountQuery(unsupported), null);
  } finally { sqlite.exec('DELETE FROM deals WHERE deal_number BETWEEN 300 AND 326'); }
});
test('Neon yearly count is parameterized and does not use the 15-record sample', async () => {
  sqlite.prepare('INSERT INTO settings VALUES (?,?)').run('neon_database_url', 'postgresql://u:p@ep-test.us-east-2.aws.neon.tech/db');
  try {
    neonResponses = [{ ok: true, json: async () => ({ fields: [{ name: 'deal_count', dataTypeID: 20 }], rows: [['106761']] }) }];
    const before = calls;
    await handler({ chat: { id: 1 }, text: '2025-yilda nechta bitim bolgan?' });
    assert.match(sent.at(-1).text, /106 761 ta bitim/);
    assert.match(lastNeonRequest.query, /count\(\*\)/);
    assert.doesNotMatch(lastNeonRequest.query, /LIMIT/i);
    assert.deepEqual(lastNeonRequest.params, ['2025-01-01', '2026-01-01']);
    assert.equal(calls, before);
  } finally { sqlite.exec("DELETE FROM settings WHERE key='neon_database_url'"); }
});
test('natural-language filtered questions are planned once, then answered from SQL only', async () => {
  const original = plannerPlan;
  const before = calls;
  try {
    plannerPlan = { action: 'count', filters: { terms: ['мука'], dateFrom: '2026-01-01', dateTo: '2027-01-01' } };
    await handler({ chat: { id: 1 }, text: '2026-yilda un bo‘yicha nechta bitim bo‘lgan?' });
    assert.match(sent.at(-1).text, /bitimlar soni: 1/);
    assert.match(sent.at(-1).text, /Mahsulot\/ishtirokchi: un/);
    assert.equal(calls, before + 1);
    assert.deepEqual(request.response_format, { type: 'json_object' });
    plannerPlan = { action: 'count', filters: { terms: ['nonexistent-product'] } };
    await handler({ chat: { id: 1 }, text: 'Mavjud bo‘lmagan mahsulotdan nechta bitim bor?' });
    assert.match(sent.at(-1).text, /mos yozuv reyestrdan topilmadi/);
    assert.equal(calls, before + 2); // No second model call after the empty SQL result.
    plannerPlan = { action: 'count', filters: { sql: 'DROP TABLE deals' } };
    await handler({ chat: { id: 1 }, text: 'Reyestrni tekshir' });
    assert.match(sent.at(-1).text, /shartlarni aniq ajrata olmadim/);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM deals').get().n, 1);
  } finally { plannerPlan = original; }
});
test('answer formatter refuses missing money and mixed-unit totals', async () => {
  const { formatPlanResult } = await import('../tgcloud/lib/question_answer.js');
  assert.match(formatPlanResult('Jami summa qancha?', { action: 'sum', metric: 'amount_uzs', filters: {} },
    [{ matched: 10, value: 100, missing_amount: 1 }]), /kurs yetishmayapti/);
  assert.match(formatPlanResult('Jami hajm qancha?', { action: 'sum', metric: 'volume', filters: {} },
    [{ matched: 10, value: 100, unit_count: 2 }]), /aniqroq/);
});
test('natural-language average uses weighted database values and exposes applied filters', async () => {
  const original = plannerPlan;
  const before = calls;
  try {
    plannerPlan = { action: 'average', metric: 'unit_price_uzs', filters: { terms: ['мука'] } };
    await handler({ chat: { id: 1 }, text: 'Unning o‘rtacha narxi qancha?' });
    assert.match(sent.at(-1).text, /60 000 so‘m/);
    assert.match(sent.at(-1).text, /o‘rtacha birlik narxi/);
    assert.match(sent.at(-1).text, /Mahsulot\/ishtirokchi: un/);
    assert.equal(calls, before + 1);
  } finally { plannerPlan = original; }
});
test('export totals are readable and have no source boilerplate or SQL date operators', async () => {
  const { formatPlanResult } = await import('../tgcloud/lib/question_answer.js');
  const plan = { action: 'sum', metric: 'amount_uzs', filters: {
    contractType: 'Экспортный', dateFrom: '2024-01-01', dateTo: '2025-01-01',
  } };
  const rows = [{ matched: 12345, value: 2621400340149.8916, missing_amount: 0 }];
  const answer = formatPlanResult('2024-yilda eksport summasi qancha?', plan, rows);
  assert.match(answer, /2024-yilda eksport bitimlarining jami summasi: 2 621 400 340 149\.89 so‘m\./);
  assert.match(answer, /12 345 ta bitim/);
  assert.doesNotMatch(answer, /Manba:|sun’iy|Qo‘llangan|≥|Sana <|Экспортный/);
  const russian = formatPlanResult('Какова сумма экспорта за 2024 год?', plan, rows);
  assert.match(russian, /За 2024 год общий оборот экспортных сделок/);
  assert.match(russian, /2 621 400 340 149,89 сум/);
  assert.doesNotMatch(russian, /Источник|вымышл/);
  await handler({ chat: { id: 1 }, text: '/start' });
  assert.doesNotMatch(sent.at(-1).text, /Manba:|sun’iy|вымышл/);
  assert.deepEqual(sent.at(-1).reply_markup, { remove_keyboard: true });
});
test('start/help and removed commands never call the model', async () => {
  const before = calls;
  const message = text => ({ chat: { id: 500, type: 'private' }, from: { id: 42, language_code: 'ru' }, text });
  await handler(message('/start@UzexBot invitation'));
  assert.match(sent.at(-1).text, /Здравствуйте/);
  assert.match(sent.at(-1).text, /Assalomu alaykum/);
  await handler(message('/help'));
  assert.match(sent.at(-1).text, /Примеры/);
  assert.match(sent.at(-1).text, /Misollar/);
  assert.doesNotMatch(sent.at(-1).text, /\/lang/);
  await handler(message('/lang'));
  assert.match(sent.at(-1).text, /Такой команды нет/);
  assert.deepEqual(sent.at(-1).reply_markup, { remove_keyboard: true });
  await handler(message('/not_a_command'));
  assert.match(sent.at(-1).text, /Такой команды нет/);
  assert.equal(calls, before);
});
test('answers follow each question language and ignore old stored preferences', async () => {
  try {
    sqlite.exec("INSERT INTO settings (key,value) VALUES ('user_lang:42','ru')");
    await handler({ chat: { id: 500 }, from: { id: 42 }, text: '2026-yilda nechta bitim bolgan?' });
    assert.match(sent.at(-1).text, /2026-yilda reyestrda 1 ta/);
    await handler({ chat: { id: 500 }, from: { id: 42 }, text: 'Сколько сделок было в 2026 году?' });
    assert.match(sent.at(-1).text, /За 2026 год зарегистрировано 1/);
  } finally { sqlite.exec("DELETE FROM settings WHERE key LIKE 'user_lang:%'"); }
});
test('language preference also controls planned replies and missing-data messages', async () => {
  const { formatPlanResult } = await import('../tgcloud/lib/question_answer.js');
  const { noDataReply } = await import('../tgcloud/lib/no_data_reply.js');
  const plan = { action: 'count', filters: {} };
  assert.match(formatPlanResult('Nechta bitim bor?', plan, [{ matched: 5, value: 5 }], 'ru'), /Количество сделок/);
  assert.match(formatPlanResult('Сколько сделок?', plan, [{ matched: 5, value: 5 }], 'uz'), /Bitimlar soni/);
  assert.match(noDataReply('un', 'no_match', null, 'ru'), /не найдено записей/);
});
test('Telegram command menu contains only start/help in both languages', async () => {
  const { default: register } = await import('../tgcloud/lib/register_commands.js');
  assert.deepEqual(await register(), { registered: ['start', 'help'] });
  assert.equal(commandMenus.length, 3);
  for (const menu of commandMenus) assert.deepEqual(menu.commands.map(c => c.command), ['start', 'help']);
  assert.equal(commandMenus.at(-1).language_code, 'ru');
});
test('missing rate, zero volume, and unknown currency are never guessed', () => {
  const row = { quantity: 2, lot: 10, total_amount: 100, contract_type: 'Экспортный' };
  assert.equal(calculateDeal(row).total_uzs, null);
  assert.equal(calculateDeal({ ...row, quantity: 0 }).unit_price, null);
  assert.equal(calculateDeal({ ...row, contract_type: 'Внутренний' }).total_uzs, null);
  assert.equal(calculateDeal({ ...row, currency: 'UZS', contract_type: 'Внутренний' }).total_uzs, 100);
});
test('CSV quoting, UTF-8, embedded newline, final line, dates and numbers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'uzex-test-'));
  try {
    const path = join(dir, 'test.csv');
    await writeFile(path, '\uFEFFname,value\r\n"O‘rik, ""oq""\nnav",123\r\nx,456');
    const rows = [];
    for await (const row of readCsv(path)) rows.push(row);
    assert.deepEqual(rows, [{ name: 'O‘rik, "oq"\nnav', value: '123' }, { name: 'x', value: '456' }]);
    assert.equal(number('1 234.50'), 1234.5);
    assert.equal(date('29.02.2024'), '2024-02-29');
    assert.throws(() => date('31.02.2024')); assert.throws(() => number(''));
  } finally { await rm(dir, { recursive: true }); }
});
