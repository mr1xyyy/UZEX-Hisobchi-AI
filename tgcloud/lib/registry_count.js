import { db, fetch } from 'sdk';
import { normalize, NO_ANSWER } from './normalize.js';
import { neonQuery } from './neon_http.js';
import { formatNumber } from './reply_format.js';
import { isRussian } from './locale.js';

// Only total/yearly registry counts. Extra filters and other statistical intents
// deliberately do not match this grammar: they require their own SQL plan.
export function parseCountQuery(query) {
  const words = normalize(query).split(' ').filter(Boolean);
  const years = words.filter(word => /^(19|20)\d{2}$/.test(word));
  if (years.length > 1) return null;
  const uz = words.some(word => ['nechta', 'qancha'].includes(word)) && words.some(word => ['bitim', 'bitimlar'].includes(word));
  const ru = words.includes('сколько') && words.some(word => ['сделок', 'сделки'].includes(word));
  if (!uz && !ru) return null;
  const allowed = new Set(('yil yilda yili yilida nechta qancha bitim bitimlar bolgan boldi tuzilgan tuzildi bor edi jami ta soni spot reyestrda ' +
    'в за году год сколько сделок сделки было заключено зарегистрировано всего спот реестре').split(' '));
  if (words.some(word => !allowed.has(word) && !years.includes(word))) return null;
  return { year: years.length ? Number(years[0]) : null, language: ru ? 'ru' : 'uz', ...(words.some(w => ['spot', 'спот'].includes(w)) ? { tradeForm: 'Спот' } : {}) };
}
export async function answerRegistryCount(query, language) {
  const intent = parseCountQuery(query);
  if (!intent) return null;
  const neon = await db.get("SELECT value FROM settings WHERE key='neon_database_url'");
  const from = intent.year ? `${intent.year}-01-01` : null;
  const to = intent.year ? `${intent.year + 1}-01-01` : null;
  let row;
  const baseWhere = " WHERE COALESCE(status,'') NOT LIKE 'Аннулирован%'" + (intent.tradeForm ? " AND trade_form='Спот'" : '');
  if (neon?.value) {
    const sql = 'SELECT count(*) AS deal_count FROM uzex.deals' + baseWhere +
      (from ? ' AND deal_date >= $1::date AND deal_date < $2::date' : '');
    [row] = await neonQuery(fetch, neon.value, sql, from ? [from, to] : []);
  } else {
    row = await db.get('SELECT count(*) AS deal_count FROM deals' + baseWhere +
      (from ? ' AND deal_date >= :from AND deal_date < :to' : ''), from ? { ':from': from, ':to': to } : {});
  }
  const count = Number(row?.deal_count);
  if (!Number.isSafeInteger(count) || count <= 0) return NO_ANSWER;
  if (isRussian(query, language)) return `${intent.year ? 'За ' + intent.year + ' год' : 'В реестре'} зарегистрировано ${formatNumber(count, true)} ${intent.tradeForm ? 'спот-сделок' : 'сделок'}.\nАннулированные сделки исключены.`;
  return `${intent.year ? intent.year + '-yilda reyestrda' : 'Reyestrda'} ${formatNumber(count)} ta ${intent.tradeForm ? 'spot ' : ''}bitim qayd etilgan.\nBekor qilingan bitimlar hisobga olinmagan.`;
}
