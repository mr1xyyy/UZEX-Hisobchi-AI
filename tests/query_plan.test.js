import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { compilePlan, validatePlan } from '../tgcloud/lib/query_plan.js';
import { normalize } from '../tgcloud/lib/normalize.js';

function database(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE deals (deal_number INTEGER PRIMARY KEY,deal_date TEXT,product_name TEXT,search_text TEXT,
    quantity INTEGER,lot INTEGER,total_amount REAL,contract_type TEXT,currency TEXT,unit TEXT,status TEXT,
    seller_inn TEXT,buyer_inn TEXT,seller_broker TEXT,buyer_broker TEXT,contract_number TEXT,
    region TEXT DEFAULT 'namangan',product_grade TEXT DEFAULT '1',trade_form TEXT DEFAULT 'Спот');
    CREATE TABLE usd_rates(date TEXT PRIMARY KEY,rate REAL);
    CREATE TABLE participants(inn TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE brokers(code TEXT PRIMARY KEY,name TEXT);
    INSERT INTO usd_rates VALUES ('2025-01-01',12000);
    INSERT INTO participants VALUES ('111111111','Seller'),('222222222','Buyer');
    INSERT INTO brokers VALUES ('BK001','Seller Broker'),('BK002','Buyer Broker');`);
  db.exec('CREATE TABLE contracts(number TEXT PRIMARY KEY)');
  const insert = db.prepare(`INSERT INTO deals (deal_number,deal_date,product_name,search_text,quantity,lot,total_amount,contract_type,currency,unit,status,seller_inn,buyer_inn,seller_broker,buyer_broker,contract_number) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const [id, date, product, quantity, lot, amount, currency] of [
    [1, '2025-01-01', 'Хлопок 1-сорта', 2, 10, 100, 'USD'],
    [2, '2025-01-01', 'Хлопок 1-сорта', 1, 10, 300000, 'UZS'],
    [3, '2025-01-01', 'Пшеница', 1, 5, 500, 'UZS'],
    [4, '2024-12-31', 'Хлопок 1-сорта', 1, 1, 700, 'UZS'],
  ]) insert.run(id, date, product, normalize(product), quantity, lot, amount,
    currency === 'USD' ? 'Экспортный' : 'Внутренний', currency, 'тонна', 'Исполнен',
    '111111111', '222222222', 'BK001', 'BK002', '100001');
  return db;
}
const filters = { terms: ['хлопок'], dateFrom: '2025-01-01', dateTo: '2026-01-01' };
function execute(db, plan) {
  const compiled = compilePlan(plan, false);
  return db.prepare(compiled.query).all(compiled.params);
}
test('SQL plans calculate counts, sums and weighted prices over complete filtered data', t => {
  const db = database(t);
  const count = execute(db, { action: 'count', filters })[0];
  assert.equal(count.value, 2);
  assert.equal(count.matched, 2);
  assert.equal(execute(db, { action: 'sum', metric: 'amount_uzs', filters })[0].value, 1500000);
  assert.equal(execute(db, { action: 'sum', metric: 'volume', filters })[0].value, 30);
  assert.equal(execute(db, { action: 'average', metric: 'unit_price_uzs', filters })[0].value, 50000);
  assert.equal(execute(db, { action: 'min', metric: 'unit_price_uzs', filters })[0].value, 30000);
  assert.equal(execute(db, { action: 'max', metric: 'amount_uzs', filters })[0].value, 1200000);
});
test('grouping, rankings and joined record lookups use database results', t => {
  const db = database(t);
  const years = execute(db, { action: 'group', metric: 'count', groupBy: 'year', filters: {}, limit: 10 });
  assert.deepEqual(years.map(r => [r.group_value, r.value]), [['2025', 3], ['2024', 1]]);
  const brokers = execute(db, { action: 'group', metric: 'count', groupBy: 'seller_broker', filters: {} });
  assert.equal(brokers[0].group_value, 'BK001'); assert.equal(brokers[0].value, 4);
  const cheapest = execute(db, { action: 'list', filters, sortBy: 'unit_price_uzs', order: 'asc', limit: 1 });
  assert.equal(cheapest[0].deal_number, 2);
  assert.equal(cheapest[0].seller_name, 'Seller');
});
test('missing rates and incompatible units remain visible to the answer guardrails', t => {
  const db = database(t);
  db.exec("UPDATE deals SET deal_date='2025-02-01' WHERE deal_number=1");
  let row = execute(db, { action: 'sum', metric: 'amount_uzs', filters })[0];
  assert.equal(row.missing_amount, 1);
  db.exec("UPDATE deals SET unit='килограмм' WHERE deal_number=2");
  row = execute(db, { action: 'sum', metric: 'volume', filters })[0];
  assert.equal(row.unit_count, 2);
});
test('untrusted plans cannot choose SQL, tables, unknown filters or unbounded limits', t => {
  const db = database(t);
  for (const plan of [
    { action: 'DROP TABLE deals' }, { action: 'count', sql: 'DROP TABLE deals' },
    { action: 'count', filters: { ignored: 'x' } }, { action: 'count', filters: null },
    { action: 'list', limit: 999999 }, { action: 'sum', metric: 'unit_price_uzs' },
    { action: 'count', filters: { dateFrom: '2025-02-31' } },
    { action: 'count', filters: { terms: ['narxi'] } },
  ]) assert.throws(() => validatePlan(plan));
  const query = compilePlan({ action: 'count', filters: { sellerInn: "x' OR 1=1 --" } }, false);
  assert.doesNotMatch(query.query, /OR 1=1/);
  assert.equal(db.prepare(query.query).all(query.params)[0].value, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM deals').get().n, 4);
  const pg = compilePlan({ action: 'count', filters }, true);
  assert.match(pg.query, /uzex\.deals/);
  assert.ok(Array.isArray(pg.params));
  assert.ok(pg.params.includes('2025-01-01'));
  assert.equal(execute(db, { action: 'count', entity: 'brokers', filters: {} })[0].value, 2);
  assert.throws(() => validatePlan({ action: 'count', entity: 'brokers', filters: { terms: ['un'] } }));
});
test('default excludes annulled deals but an explicit request can include them', t => {
  const db = database(t);
  db.exec("UPDATE deals SET status='Аннулирован(Не оплачен)' WHERE deal_number=1");
  assert.equal(execute(db, { action: 'count', filters: {} })[0].value, 3);
  assert.equal(execute(db, { action: 'count', filters: { includeCancelled: true } })[0].value, 4);
  assert.equal(execute(db, { action: 'count', filters: { status: 'Аннулирован(Не оплачен)' } })[0].value, 1);
  assert.throws(() => validatePlan({ action: 'count', filters: { includeCancelled: 'false' } }));
});
test('region, trade form and canonical grade apply independently', t => {
  const db = database(t);
  db.exec("UPDATE deals SET region='samarqand',product_grade='2',trade_form='Форвард' WHERE deal_number=1");
  assert.equal(execute(db, { action: 'count', filters: { region: 'Самаркандской области' } })[0].value, 1);
  assert.equal(execute(db, { action: 'count', filters: { grade: '1' } })[0].value, 3);
  assert.equal(execute(db, { action: 'count', filters: { tradeForm: 'Форвард' } })[0].value, 1);
});
test('mass conversions include both kg and tonne records in weighted price', t => {
  const db = database(t);
  db.exec("UPDATE deals SET unit='килограмм' WHERE deal_number=1");
  const tonnes = execute(db, { action: 'sum', metric: 'volume', filters, outputUnit: 'тонна' })[0];
  assert.equal(tonnes.value, 10.02); assert.equal(tonnes.unit_count, 1);
  const price = execute(db, { action: 'average', metric: 'unit_price_uzs', filters, outputUnit: 'килограмм' })[0];
  assert.ok(Math.abs(price.value - 1500000 / 10020) < 1e-10);
  assert.equal(price.unit_label, 'килограмм');
});
test('export share uses the same full denominator and cancellation policy', t => {
  const db = database(t);
  const row = execute(db, { action: 'share', metric: 'amount_uzs', filters: { dateFrom: '2025-01-01', dateTo: '2026-01-01' } })[0];
  assert.equal(row.numerator_value, 1200000);
  assert.equal(row.denominator_value, 1500500);
  assert.ok(Math.abs(row.value - 100 * 1200000 / 1500500) < 1e-10);
  assert.throws(() => validatePlan({ action: 'share', metric: 'amount_uzs', filters: { contractType: 'Экспортный' } }));
});
