import { normalize, queryTerms, isGrade, NO_ANSWER } from './normalize.js';
import { formatNumber, displayUnit, displayStatus } from './reply_format.js';
import { isRussian } from './locale.js';

export function isDirectLookup(query) {
  const normalized = normalize(query);
  const terms = queryTerms(query);
  if (terms.length !== 1) return false;
  // Explicit bare lookup syntax, not questions about price or statistics.
  return !normalized.includes(' ') || (isGrade(terms[0]) && normalized.split(' ').length === 2);
}
export function lookupReply(query, context, limit = 3, language) {
  let records;
  try { records = JSON.parse(context).records; } catch { return NO_ANSWER; }
  if (!Array.isArray(records) || !records.length) return NO_ANSWER;
  const ru = isRussian(query, language);
  const labels = ru
    ? { heading: 'Подходящие сделки:', deal: 'Сделка', date: 'Дата', volume: 'Объём', price: 'Цена за единицу', unknown: 'нет данных' }
    : { heading: 'Mos bitimlar:', deal: 'Bitim', date: 'Sana', volume: 'Hajm', price: 'Birlik narxi', unknown: 'noma’lum' };
  const value = n => typeof n === 'number' && Number.isFinite(n) ? formatNumber(n, ru) : labels.unknown;
  const money = ru ? 'сум' : 'so‘m';
  const text = value => typeof value === 'string' && value.trim() ? value.replace(/[\r\n]+/g, ' ').slice(0, 220) : labels.unknown;
  return labels.heading + '\n\n' + records.slice(0, Math.min(limit, 10)).map(row => {
    const lines = [labels.deal + ' №' + (Number.isSafeInteger(row.deal_number) ? row.deal_number : labels.unknown), text(row.product_name),
      labels.date + ': ' + text(row.deal_date),
      labels.volume + ': ' + value(row.volume) + (row.unit ? ' ' + displayUnit(text(row.unit), ru) : '')];
    if (typeof row.unit_price_uzs === 'number' && Number.isFinite(row.unit_price_uzs)) {
      lines.push(labels.price + ': ' + value(row.unit_price_uzs) + ' ' + money + (row.unit ? ' / ' + displayUnit(text(row.unit), ru) : ''));
    } else {
      lines.push(labels.price + ' (' + money + '): ' + labels.unknown);
    }
    if (typeof row.total_uzs === 'number' && Number.isFinite(row.total_uzs)) lines.push((ru ? 'Сумма: ' : 'Bitim summasi: ') + value(row.total_uzs) + ' ' + money);
    else if (typeof row.total_amount === 'number' && row.currency) lines.push((ru ? 'Сумма в валюте контракта: ' : 'Shartnoma valyutasidagi summa: ') + value(row.total_amount) + ' ' + text(row.currency));
    if (row.seller_name || row.seller_inn) lines.push((ru ? 'Продавец: ' : 'Sotuvchi: ') + text(row.seller_name || row.seller_inn));
    if (row.buyer_name || row.buyer_inn) lines.push((ru ? 'Покупатель: ' : 'Xaridor: ') + text(row.buyer_name || row.buyer_inn));
    if (row.seller_broker_name || row.seller_broker) lines.push((ru ? 'Брокер продавца: ' : 'Sotuvchi brokeri: ') + text(row.seller_broker_name || row.seller_broker));
    if (row.buyer_broker_name || row.buyer_broker) lines.push((ru ? 'Брокер покупателя: ' : 'Xaridor brokeri: ') + text(row.buyer_broker_name || row.buyer_broker));
    if (row.status) lines.push((ru ? 'Статус: ' : 'Holat: ') + displayStatus(text(row.status), ru));
    return lines.join('\n');
  }).join('\n\n');
}
