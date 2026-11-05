import { db } from 'sdk';
import { queryTerms, searchPatterns, isGrade } from './normalize.js';
import { registryContext } from './registry_context.js';
import { searchNeon } from './neon_search.js';
const empty = () => ({ found: false, context: null });
export async function searchRegistry(userQuery) {
  if (typeof userQuery !== 'string' || userQuery.length > 1000) return empty();
  const terms = queryTerms(userQuery);
  if (!terms.length) return empty();
  const neon = await db.get("SELECT value FROM settings WHERE key = 'neon_database_url'");
  if (neon?.value) return searchNeon(neon.value, terms);
  const params = {};
  const clauses = terms.map((term, i) => {
    if (isGrade(term)) { params[':grade' + i] = term.split(' ')[0]; return `d.product_grade = :grade${i}`; }
    const field = 'd.search_text';
    return '(' + searchPatterns(term).map((pattern, j) => {
      const key = `:q${i}_${j}`;
      params[key] = pattern;
      return `${field} LIKE ${key} ESCAPE '\\'`;
    }).join(' OR ') + ')';
  });
  clauses.push("COALESCE(d.status,'') NOT LIKE 'Аннулирован%'");
  const ftsTerms = terms.filter(term => !isGrade(term));
  let fts = '';
  const exists = await db.get("SELECT name FROM sqlite_master WHERE name = 'deals_fts'");
  if (exists && ftsTerms.length) {
    params[':match'] = ftsTerms.map(t => '"' + t.replace(/"/g, '""') + '"*').join(' AND ');
    fts = ' AND d.deal_number IN (SELECT rowid FROM deals_fts WHERE deals_fts MATCH :match)';
  }
  const select = `SELECT d.*, r.rate AS usd_rate, s.name AS seller_name, b.name AS buyer_name,
    sb.name AS seller_broker_name, bb.name AS buyer_broker_name
    FROM deals d LEFT JOIN usd_rates r ON r.date = d.deal_date
    LEFT JOIN participants s ON s.inn = d.seller_inn LEFT JOIN participants b ON b.inn = d.buyer_inn
    LEFT JOIN brokers sb ON sb.code = d.seller_broker LEFT JOIN brokers bb ON bb.code = d.buyer_broker
    WHERE ${clauses.join(' AND ')}`;
  const order = ' ORDER BY d.deal_date DESC, d.deal_number DESC LIMIT 16';
  let rows;
  try { rows = await db.all(select + fts + order, params); }
  catch (error) { if (!fts) throw error; rows = []; }
  if (!rows?.length && fts) { delete params[':match']; rows = await db.all(select + order, params); }
  return registryContext(rows || []);
}
