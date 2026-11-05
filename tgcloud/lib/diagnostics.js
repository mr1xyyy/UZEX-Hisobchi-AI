import { db, fetch } from 'sdk';
import { neonQuery } from './neon_http.js';
import { searchRegistry } from './rag_search.js';
import { queryTerms } from './normalize.js';
import { isDirectLookup } from './lookup_reply.js';
import { answerRegistryCount } from './registry_count.js';
import { answerQuestion } from './question_answer.js';

// Management /run only. No Telegram command or public endpoint exposes this.
export default async function diagnose(input) {
  const neon = await db.get("SELECT value FROM settings WHERE key='neon_database_url'");
  const key = await db.get("SELECT value FROM settings WHERE key='deepseek_api_key'");
  const query = typeof input.query === 'string' ? input.query.slice(0, 1000) : '1-sorta';
  const result = { backend: neon?.value ? 'neon' : 'sqlite', deepseekConfigured: Boolean(key?.value),
    terms: queryTerms(query), note: 'Local source via management /run; deployed code may differ.' };
  if (neon?.value) {
    const stats = await neonQuery(fetch, neon.value,
      "SELECT (SELECT count(*) FROM uzex.deals) AS deals, (SELECT value FROM uzex.import_state WHERE id='ready') AS ready");
    result.deals = stats[0]?.deals;
    result.importReady = stats[0]?.ready === 'true';
  } else {
    result.deals = (await db.get('SELECT count(*) AS deals FROM deals'))?.deals;
  }
  const countAnswer = await answerRegistryCount(query);
  if (countAnswer !== null) return { ...result, responseMode: 'sql_count', answer: countAnswer };
  if (!isDirectLookup(query)) {
    if (input.answer === true) return { ...result, responseMode: 'planned_sql',
      diagnostic: await answerQuestion(query, { diagnostic: true }) };
    return { ...result, responseMode: 'planned_sql', note: 'Use --answer to test question planning (one DeepSeek API call).' };
  }
  const search = await searchRegistry(query);
  result.found = search.found;
  result.responseMode = isDirectLookup(query) ? 'registry' : 'deepseek';
  const records = search.found ? JSON.parse(search.context).records : [];
  result.matchesInContext = records.length;
  result.examples = records.slice(0, 3).map(row => ({ dealNumber: row.deal_number, productName: row.product_name }));
  return result;
}
