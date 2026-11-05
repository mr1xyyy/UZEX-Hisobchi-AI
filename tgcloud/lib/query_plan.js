import { queryTerms, searchPatterns, isGrade } from './normalize.js';
import { canonicalRegion } from './registry_dimensions.js';

const actions = ['list', 'count', 'sum', 'average', 'min', 'max', 'group', 'share', 'unsupported'];
const metrics = ['count', 'amount_uzs', 'volume', 'unit_price_uzs'];
const groups = ['year', 'month', 'product', 'unit', 'seller', 'buyer', 'seller_broker', 'buyer_broker', 'status'];
const filterKeys = ['terms', 'dateFrom', 'dateTo', 'sellerInn', 'buyerInn', 'sellerBroker', 'buyerBroker',
  'status', 'contractType', 'unit', 'dealNumber', 'contractNumber', 'region', 'tradeForm', 'grade', 'includeCancelled'];
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validatePlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid query plan');
  if (Object.keys(input).some(k => !['action', 'metric', 'groupBy', 'filters', 'limit', 'order', 'sortBy', 'entity', 'outputUnit'].includes(k))) throw new Error('Unexpected plan field');
  if (!actions.includes(input.action)) throw new Error('Invalid action');
  if (input.action === 'unsupported') return { action: 'unsupported' };
  const plan = { ...input, filters: input.filters ? { ...input.filters } : {}, limit: input.limit ?? 3, order: input.order || 'desc' };
  if (input.filters === null) throw new Error('Invalid filters');
  if (plan.entity !== undefined && !['deals', 'contracts', 'participants', 'brokers', 'usd_rates'].includes(plan.entity)) throw new Error('Invalid entity');
  if (plan.entity && plan.entity !== 'deals' && (plan.action !== 'count' || Object.keys(plan.filters).length)) throw new Error('Only unfiltered reference-table counts are supported');
  if (plan.sortBy !== undefined && (plan.action !== 'list' || !['deal_date', 'amount_uzs', 'volume', 'unit_price_uzs'].includes(plan.sortBy))) throw new Error('Invalid sort');
  if (!Number.isInteger(plan.limit) || plan.limit < 1 || plan.limit > 10 || !['asc', 'desc'].includes(plan.order)) throw new Error('Invalid limit/order');
  if (plan.metric !== undefined && !metrics.includes(plan.metric)) throw new Error('Invalid metric');
  if (['sum', 'average', 'min', 'max', 'group', 'share'].includes(plan.action) && !metrics.includes(plan.metric)) throw new Error('Metric required');
  if (plan.action === 'share' && (!['amount_uzs', 'count'].includes(plan.metric) || plan.filters.contractType)) throw new Error('Export share needs an unfiltered contract-type denominator');
  if (plan.outputUnit !== undefined && (!['тонна', 'килограмм'].includes(plan.outputUnit) || !['volume', 'unit_price_uzs'].includes(plan.metric) || plan.action === 'list')) throw new Error('Invalid output unit');
  if (plan.action === 'group' && (!groups.includes(plan.groupBy) || plan.metric === 'unit_price_uzs')) throw new Error('Unsupported grouping');
  if (plan.action !== 'group' && plan.groupBy !== undefined) throw new Error('Unexpected grouping');
  if (plan.action === 'sum' && !['amount_uzs', 'volume'].includes(plan.metric)) throw new Error('Invalid sum metric');
  if (plan.action === 'average' && plan.metric !== 'unit_price_uzs') throw new Error('Only weighted unit price average is supported');
  if (['min', 'max'].includes(plan.action) && plan.metric === 'count') throw new Error('Invalid extreme metric');
  if (typeof plan.filters !== 'object' || Array.isArray(plan.filters) || !plan.filters) throw new Error('Invalid filters');
  for (const [key, value] of Object.entries(plan.filters)) {
    if (!filterKeys.includes(key)) throw new Error('Unsupported filter');
    if (key === 'terms') {
      if (!Array.isArray(value) || value.length > 8 || value.some(t => typeof t !== 'string' || !t.trim() || t.length > 100 || !queryTerms(t).length)) throw new Error('Invalid search terms');
    } else if (key === 'includeCancelled') {
      if (typeof value !== 'boolean') throw new Error('Invalid cancellation scope');
    } else if (key === 'region') {
      const canonical = canonicalRegion(value);
      if (!canonical) throw new Error('Unknown region');
      plan.filters.region = canonical;
    } else if (key === 'grade') {
      if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Invalid grade');
    } else if (key === 'dateFrom' || key === 'dateTo') {
      if (!validDate(value)) throw new Error('Invalid date');
    } else if (key === 'dealNumber') {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid deal number');
    } else if (typeof value !== 'string' || !value.trim() || value.length > 150) throw new Error('Invalid filter value');
  }
  if (plan.filters.dateFrom && plan.filters.dateTo && plan.filters.dateFrom >= plan.filters.dateTo) throw new Error('Invalid date interval');
  return plan;
}

export function compilePlan(input, postgres = true) {
  const plan = validatePlan(input);
  if (plan.action === 'unsupported') throw new Error('Unsupported query');
  const params = postgres ? [] : {};
  let next = 0;
  const bind = value => {
    const key = postgres ? '$' + (++next) : ':p' + (++next);
    if (postgres) params.push(value); else params[key] = value;
    return key;
  };
  const schema = postgres ? 'uzex.' : '';
  if (plan.entity && plan.entity !== 'deals') {
    return { query: `SELECT count(*) AS matched,count(*) AS value FROM ${schema}${plan.entity}`, params, plan };
  }
  const escape = postgres ? "E'\\\\'" : "'\\'";
  const where = [];
  const filters = plan.filters;
  if (!filters.status && filters.includeCancelled !== true) where.push("COALESCE(d.status,'') NOT LIKE 'Аннулирован%'");
  const equality = { sellerInn: 'seller_inn', buyerInn: 'buyer_inn', sellerBroker: 'seller_broker',
    buyerBroker: 'buyer_broker', status: 'status', contractType: 'contract_type', unit: 'unit',
    dealNumber: 'deal_number', contractNumber: 'contract_number', region: 'region', tradeForm: 'trade_form', grade: 'product_grade' };
  for (const [key, column] of Object.entries(equality)) if (filters[key] !== undefined) where.push(`d.${column} = ${bind(filters[key])}`);
  if (filters.dateFrom) where.push(`d.deal_date >= ${bind(filters.dateFrom)}`);
  if (filters.dateTo) where.push(`d.deal_date < ${bind(filters.dateTo)}`);
  for (const term of (filters.terms || []).flatMap(queryTerms)) {
    if (isGrade(term)) { where.push(`d.product_grade = ${bind(term.split(' ')[0])}`); continue; }
    const field = 'd.search_text';
    where.push('(' + searchPatterns(term).map(pattern => `${field} LIKE ${bind(pattern)} ESCAPE ${escape}`).join(' OR ') + ')');
  }
  const nativeVolume = '(1.0 * d.quantity * d.lot)';
  const volume = plan.outputUnit === 'тонна' ? `CASE WHEN d.unit='тонна' THEN ${nativeVolume} WHEN d.unit='килограмм' THEN ${nativeVolume}/1000.0 ELSE NULL END`
    : plan.outputUnit === 'килограмм' ? `CASE WHEN d.unit='килограмм' THEN ${nativeVolume} WHEN d.unit='тонна' THEN ${nativeVolume}*1000.0 ELSE NULL END` : nativeVolume;
  const calculationUnit = plan.outputUnit ? `CASE WHEN d.unit IN ('тонна','килограмм') THEN ${bind(plan.outputUnit)} ELSE NULL END` : 'd.unit';
  const amount = `CASE WHEN d.contract_type = 'Экспортный' OR d.currency IN ('USD','Доллар США')
    THEN CASE WHEN r.rate > 0 THEN d.total_amount * r.rate ELSE NULL END
    WHEN d.currency IN ('UZS','Узбекский сум') THEN d.total_amount ELSE NULL END`;
  const base = `WITH base AS (SELECT d.*, r.rate AS usd_rate,
    s.name AS seller_name, b.name AS buyer_name, sb.name AS seller_broker_name, bb.name AS buyer_broker_name,
    ${volume} AS volume, ${calculationUnit} AS calculation_unit, ${amount} AS amount_uzs,
    (${amount}) / NULLIF(${volume},0) AS unit_price_uzs
    FROM ${schema}deals d LEFT JOIN ${schema}usd_rates r ON r.date=d.deal_date
    LEFT JOIN ${schema}participants s ON s.inn=d.seller_inn LEFT JOIN ${schema}participants b ON b.inn=d.buyer_inn
    LEFT JOIN ${schema}brokers sb ON sb.code=d.seller_broker LEFT JOIN ${schema}brokers bb ON bb.code=d.buyer_broker
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}) `;
  const summary = `count(*) AS matched, count(DISTINCT calculation_unit) AS unit_count, min(calculation_unit) AS unit_label,
    sum(CASE WHEN calculation_unit IS NULL OR calculation_unit = '' THEN 1 ELSE 0 END) AS missing_unit,
    count(DISTINCT product_name) AS product_count,
    sum(CASE WHEN amount_uzs IS NULL THEN 1 ELSE 0 END) AS missing_amount,
    sum(CASE WHEN volume IS NULL OR volume <= 0 THEN 1 ELSE 0 END) AS invalid_volume`;
  let select;
  if (plan.action === 'list') select = `SELECT *, (SELECT count(*) FROM base WHERE amount_uzs IS NULL) AS global_missing
    FROM base ORDER BY ${plan.sortBy || 'deal_date'} ${plan.order.toUpperCase()} NULLS LAST,deal_number DESC LIMIT ${plan.limit}`;
  else if (plan.action === 'count') select = `SELECT ${summary},count(*) AS value FROM base`;
  else if (plan.action === 'group') {
    const group = { year: 'substr(CAST(deal_date AS TEXT),1,4)', month: 'substr(CAST(deal_date AS TEXT),1,7)',
      product: 'product_name', unit: 'unit', seller: 'seller_inn', buyer: 'buyer_inn',
      seller_broker: 'seller_broker', buyer_broker: 'buyer_broker', status: 'status' }[plan.groupBy];
    const metric = plan.metric === 'count' ? 'count(*)' : `sum(${plan.metric})`;
    const groupName = { seller: 'seller_name', buyer: 'buyer_name', seller_broker: 'seller_broker_name', buyer_broker: 'buyer_broker_name' }[plan.groupBy];
    select = `SELECT ${group} AS group_value, ${groupName ? 'min(' + groupName + ')' : 'NULL'} AS group_name, ${metric} AS value, ${summary},
      (SELECT sum(CASE WHEN amount_uzs IS NULL THEN 1 ELSE 0 END) FROM base) AS global_missing,
      (SELECT count(DISTINCT calculation_unit) FROM base) AS global_units
      FROM base GROUP BY ${group} ORDER BY value ${plan.order.toUpperCase()},group_value LIMIT ${plan.limit}`;
  } else if (plan.action === 'share') {
    const numerator = plan.metric === 'count' ? "sum(CASE WHEN contract_type='Экспортный' THEN 1 ELSE 0 END)"
      : "sum(CASE WHEN contract_type='Экспортный' THEN amount_uzs ELSE 0 END)";
    const denominator = plan.metric === 'count' ? 'count(*)' : 'sum(amount_uzs)';
    select = `SELECT ${summary}, ${numerator} AS numerator_value, ${denominator} AS denominator_value,
      100.0 * (${numerator}) / NULLIF(${denominator},0) AS value FROM base`;
  } else {
    const expression = plan.action === 'average' ? 'sum(amount_uzs) / NULLIF(sum(volume),0)'
      : `${plan.action}(${plan.metric})`;
    select = `SELECT ${summary},${expression} AS value FROM base`;
  }
  return { query: base + select, params, plan };
}

export function describeFilters(plan) {
  return Object.entries(plan.filters).map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(', ') : value}`).join('; ');
}
