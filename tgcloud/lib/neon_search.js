import { fetch } from 'sdk';
import { neonQuery } from './neon_http.js';
import { registryContext } from './registry_context.js';
import { searchPatterns, isGrade } from './normalize.js';

export function buildNeonSearch(terms, fullText = true) {
  const params = [];
  const clauses = terms.map(term => {
    if (isGrade(term)) { params.push(term.split(' ')[0]); return `d.product_grade = $${params.length}`; }
    const field = 'd.search_text';
    return '(' + searchPatterns(term).map(pattern => {
      params.push(pattern);
      return `${field} LIKE $${params.length} ESCAPE E'\\\\'`;
    }).join(' OR ') + ')';
  });
  clauses.push("COALESCE(d.status,'') NOT LIKE 'Аннулирован%'");
  const ftsTerms = terms.filter(term => !isGrade(term));
  if (fullText && ftsTerms.length) {
    params.push(ftsTerms.map(term => "'" + term.replace(/'/g, "''") + "':*").join(' & '));
    clauses.push(`to_tsvector('simple', d.search_text) @@ to_tsquery('simple', $${params.length})`);
  }
  return { params, query: `SELECT d.*, r.rate AS usd_rate, s.name AS seller_name, b.name AS buyer_name,
    sb.name AS seller_broker_name, bb.name AS buyer_broker_name
    FROM uzex.deals d LEFT JOIN uzex.usd_rates r ON r.date = d.deal_date
    LEFT JOIN uzex.participants s ON s.inn = d.seller_inn LEFT JOIN uzex.participants b ON b.inn = d.buyer_inn
    LEFT JOIN uzex.brokers sb ON sb.code = d.seller_broker LEFT JOIN uzex.brokers bb ON bb.code = d.buyer_broker
    WHERE ${clauses.join(' AND ')} ORDER BY d.deal_date DESC, d.deal_number DESC LIMIT 16` };
}
export async function searchNeon(connectionString, terms) {
  let search = buildNeonSearch(terms);
  let rows = await neonQuery(fetch, connectionString, search.query, search.params);
  if (!rows.length && terms.some(term => !isGrade(term))) {
    search = buildNeonSearch(terms, false);
    rows = await neonQuery(fetch, connectionString, search.query, search.params);
  }
  return registryContext(rows);
}
