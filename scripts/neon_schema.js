// Explicit allowlist shared by DDL and the parameterized bulk insert builder.
export const neonTables = {
  contracts: { name: 'contracts', primary: 'number', columns: [
    ['number', 'number', 'text'], ['currency', 'currency', 'text'], ['data', 'data', 'text'],
  ] },
  participants: { name: 'participants', primary: 'inn', columns: [
    ['inn', 'inn', 'text'], ['name', 'name', 'text'], ['data', 'data', 'text'],
  ] },
  brokers: { name: 'brokers', primary: 'code', columns: [
    ['code', 'code', 'text'], ['name', 'name', 'text'], ['data', 'data', 'text'],
  ] },
  usdRates: { name: 'usd_rates', primary: 'date', columns: [
    ['date', 'date', 'date'], ['rate', 'rate', 'double precision'],
  ] },
  deals: { name: 'deals', primary: 'deal_number', columns: [
    ['dealNumber', 'deal_number', 'bigint'], ['dealDate', 'deal_date', 'date'],
    ['productName', 'product_name', 'text'], ['searchText', 'search_text', 'text'],
    ['quantity', 'quantity', 'bigint'], ['totalAmount', 'total_amount', 'double precision'],
    ['startPrice', 'start_price', 'double precision'], ['contractNumber', 'contract_number', 'text'],
    ['contractType', 'contract_type', 'text'], ['currency', 'currency', 'text'], ['unit', 'unit', 'text'],
    ['lot', 'lot', 'bigint'], ['status', 'status', 'text'], ['sellerInn', 'seller_inn', 'text'],
    ['region', 'region', 'text'], ['tradeForm', 'trade_form', 'text'], ['productGrade', 'product_grade', 'text'],
    ['buyerInn', 'buyer_inn', 'text'], ['sellerBroker', 'seller_broker', 'text'], ['buyerBroker', 'buyer_broker', 'text'],
  ] },
};
export const schemaStatements = [
  'CREATE SCHEMA IF NOT EXISTS uzex',
  ...Object.values(neonTables).map(t => `CREATE TABLE IF NOT EXISTS uzex.${t.name} (${t.columns.map(([, col, type]) => `${col} ${type}${col === t.primary ? ' PRIMARY KEY' : ''}`).join(', ')})`),
  'CREATE TABLE IF NOT EXISTS uzex.import_state (id text PRIMARY KEY, value text NOT NULL)',
  'ALTER TABLE uzex.deals ADD COLUMN IF NOT EXISTS region text',
  'ALTER TABLE uzex.deals ADD COLUMN IF NOT EXISTS trade_form text',
  'ALTER TABLE uzex.deals ADD COLUMN IF NOT EXISTS product_grade text',
];
export const indexStatements = [
  "CREATE INDEX IF NOT EXISTS uzex_deals_fts_idx ON uzex.deals USING gin (to_tsvector('simple', search_text))",
  ...['product_name', 'seller_inn', 'buyer_inn', 'seller_broker', 'buyer_broker', 'deal_date', 'region', 'product_grade', 'trade_form'].map(col =>
    `CREATE INDEX IF NOT EXISTS uzex_deals_${col}_idx ON uzex.deals (${col})`),
  'ANALYZE uzex.deals',
];
export function buildBulkInsert(tableKey, rows) {
  const table = Object.hasOwn(neonTables, tableKey) ? neonTables[tableKey] : null;
  if (!table || !Array.isArray(rows) || !rows.length) throw new Error('Invalid Neon batch');
  const names = table.columns.map(([, col]) => col).join(', ');
  const fields = table.columns.map(([key, , type]) => `"${key}" ${type}`).join(', ');
  return { query: `INSERT INTO uzex.${table.name} (${names}) SELECT ${table.columns.map(([key]) => `x."${key}"`).join(', ')}
    FROM jsonb_to_recordset($1::jsonb) AS x(${fields}) ON CONFLICT (${table.primary}) ${tableKey === 'deals'
      ? 'DO UPDATE SET ' + table.columns.filter(([, col]) => col !== table.primary).map(([, col]) => `${col}=excluded.${col}`).join(', ')
      : 'DO NOTHING'}`,
    params: [JSON.stringify(rows)] };
}
export const countQuery = `SELECT
  (SELECT count(*) FROM uzex.contracts) AS contracts,
  (SELECT count(*) FROM uzex.participants) AS participants,
  (SELECT count(*) FROM uzex.brokers) AS brokers,
  (SELECT count(*) FROM uzex.usd_rates) AS usd_rates,
  (SELECT count(*) FROM uzex.deals) AS deals,
  (SELECT count(*) FROM uzex.deals WHERE COALESCE(status,'') NOT LIKE 'Аннулирован%') AS active_deals`;
