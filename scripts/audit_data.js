import { readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readCsv, date, number } from './csv.js';
import { normalize } from '../tgcloud/lib/normalize.js';

const directory = resolve(process.argv[2] || '../uzex_spot_data');
const report = { directory, files: {}, issues: {}, observations: {}, distributions: {}, productVariants: {} };
function issue(name, sample) {
  const item = report.issues[name] ||= { count: 0, samples: [] };
  item.count++;
  if (item.samples.length < 5) item.samples.push(sample);
}
function tally(name, value) {
  const values = report.distributions[name] ||= {};
  values[value || '(empty)'] = (values[value || '(empty)'] || 0) + 1;
}
function observation(name, sample) {
  const item = report.observations[name] ||= { count: 0, samples: [] };
  item.count++;
  if (item.samples.length < 5) item.samples.push(sample);
}
function numeric(value, label, id) {
  try { return number(value); } catch { issue('invalid_number', { id, label, value }); return NaN; }
}
function day(value, label, id) {
  if (!value) return null;
  try { return date(value); } catch { issue('invalid_date', { id, label, value }); return null; }
}
async function load(file, key, consume) {
  const seen = new Set();
  const stats = report.files[file] = { rows: 0, blankFields: {} };
  for await (const row of readCsv(join(directory, file))) {
    stats.rows++;
    const id = row[key];
    if (!id) issue('missing_primary_key', { file, row: stats.rows });
    if (seen.has(id)) issue('duplicate_primary_key', { file, id });
    seen.add(id);
    for (const [field, value] of Object.entries(row)) if (!value.trim()) stats.blankFields[field] = (stats.blankFields[field] || 0) + 1;
    consume(row, id);
  }
  console.log(`${file}: ${stats.rows} audited`);
}
const people = new Map(), brokers = new Map(), contracts = new Map(), rates = new Map();
await load('participants.csv', 'ИНН', (r, id) => {
  people.set(id, r);
  if (!/^\d{9}$/.test(id)) issue('invalid_participant_inn', id);
  tally('participant_regions', r['Регион']);
});
await load('brokers.csv', 'Код брокера', (r, id) => {
  brokers.set(id, r);
  if (!/^BK\d{3}$/.test(id)) issue('invalid_broker_code', id);
});
await load('contracts.csv', 'Номер контракта', (r, id) => {
  contracts.set(id, { ...r, starts: day(r['Дата регистрации'], 'contract starts', id), ends: day(r['Действует до'], 'contract ends', id) });
  if (!people.has(r['ИНН продавца'])) issue('contract_missing_seller', id);
  tally('contract_currencies', r['Валюта']);
});
await load('usd_rates.csv', 'Дата', (r, id) => {
  const iso = day(id, 'USD date', id);
  const rate = numeric(r['Курс'], 'USD rate', id);
  if (!(rate > 0)) issue('invalid_usd_rate', id);
  if (iso) rates.set(iso, rate);
});
const allIds = new Set(), variants = new Map(), rawProducts = new Set();
const files = (await readdir(directory)).filter(f => /^deals_\d{4}\.csv$/.test(f)).sort();
for (const file of files) await load(file, 'Номер сделки', (r, id) => {
  if (allIds.has(id)) issue('duplicate_deal_across_files', id);
  allIds.add(id);
  const contract = contracts.get(r['Номер контракта']);
  const sold = numeric(r['Количество'], 'quantity', id);
  const lot = numeric(r['Лот'], 'lot', id);
  const amount = numeric(r['Сумма сделки'], 'total amount', id);
  const delivered = r['Поставлено'].trim() ? numeric(r['Поставлено'], 'delivered lots', id) : null;
  if (delivered === null) observation('delivery_quantity_not_recorded', { id, status: r['Состояние сделки'] });
  const dealDay = day(r['Дата сделки'], 'deal date', id);
  const paidDay = day(r['Дата оплаты'], 'payment date', id);
  const shippedDay = day(r['Дата поставки'], 'delivery date', id);
  if (!dealDay) issue('missing_or_invalid_deal_date', id);
  if (!(sold > 0 && lot > 0 && amount >= 0)) issue('invalid_deal_values', id);
  if (!Number.isInteger(sold) || !Number.isInteger(lot)) issue('noninteger_quantity_or_lot', id);
  if (delivered !== null && !(delivered >= 0 && delivered <= sold)) issue('delivered_outside_quantity', { id, sold, delivered });
  if (paidDay && dealDay && paidDay < dealDay) issue('payment_before_deal', id);
  if (shippedDay && dealDay && shippedDay < dealDay) issue('delivery_before_deal', id);
  if (shippedDay && paidDay && shippedDay < paidDay) issue('delivery_before_payment', id);
  if (r['Состояние сделки'] === 'Исполнен' && delivered !== sold) issue('fulfilled_delivery_mismatch', { id, sold, delivered });
  if (r['Состояние сделки'] === 'Исполнен(Частично)' && !(delivered > 0 && delivered < sold)) issue('partial_delivery_mismatch', { id, sold, delivered });
  if (r['Состояние сделки'].startsWith('Аннулирован') && delivered > 0) issue('annulled_but_delivered', id);
  for (const [field, role] of [['ИНН продавца', 'Продавец'], ['ИНН покупателя', 'Покупатель']]) {
    const person = people.get(r[field]);
    if (!person) issue('deal_missing_participant', { id, field, inn: r[field] });
    else if (person['Роль'] !== role) issue('participant_role_mismatch', { id, field, role: person['Роль'] });
  }
  for (const field of ['Брокер продавца', 'Брокер покупателя']) if (!brokers.has(r[field])) issue('deal_missing_broker', { id, field });
  if (!contract) issue('deal_missing_contract', id);
  else {
    for (const field of ['ИНН продавца', 'Единица измерения', 'Тип контракта', 'Форма контракта', 'Регион']) {
      if (r[field] !== contract[field]) {
        const detail = { id, field, deal: r[field], contract: contract[field] };
        if (field === 'Регион') observation('region_label_difference', detail);
        else issue('contract_deal_field_mismatch', detail);
      }
    }
    if (lot !== numeric(contract['Лот'], 'contract lot', id)) issue('contract_lot_mismatch', id);
    if (dealDay && contract.starts && dealDay < contract.starts) issue('deal_before_contract', id);
    if (dealDay && contract.ends && dealDay > contract.ends) issue('deal_after_contract_expiry', id);
    if ((r['Тип контракта'] === 'Экспортный' || contract['Валюта'] === 'Доллар США') && !rates.has(dealDay)) issue('missing_deal_usd_rate', id);
  }
  if (dealDay) {
    report.minDealDate = !report.minDealDate || dealDay < report.minDealDate ? dealDay : report.minDealDate;
    report.maxDealDate = !report.maxDealDate || dealDay > report.maxDealDate ? dealDay : report.maxDealDate;
  }
  tally('deal_forms', r['Форма контракта']);
  tally('deal_statuses', r['Состояние сделки']);
  tally('deal_units', r['Единица измерения']);
  const product = r['Наименование товара'];
  rawProducts.add(product);
  const normalized = normalize(product);
  if (!variants.has(normalized)) variants.set(normalized, new Set());
  variants.get(normalized).add(product);
});
const collisions = [...variants.entries()].filter(([, raw]) => raw.size > 1);
report.productVariants = { distinctRawNames: rawProducts.size, distinctNormalizedNames: variants.size,
  normalizedGroupsWithMultipleSpellings: collisions.length,
  examples: collisions.slice(0, 8).map(([normalized, raw]) => ({ normalized, variants: [...raw] })) };
const output = resolve('DATA_AUDIT.json');
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, issues: report.issues, observations: report.observations, distributions: report.distributions,
  productVariants: report.productVariants, minDate: report.minDealDate, maxDate: report.maxDealDate }, null, 2));
