export function formatNumber(value, ru = false) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return ru ? 'нет данных' : 'noma’lum';
  const [integer, decimal] = n.toFixed(2).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fraction = decimal.replace(/0+$/, '');
  return grouped + (fraction ? (ru ? ',' : '.') + fraction : '');
}
export function displayUnit(value, ru = false) {
  if (ru) return value || '';
  return ({ тонна: 'tonna', килограмм: 'kg', литр: 'litr', штука: 'dona', метр: 'metr' })[value] || value || '';
}
export function displayStatus(value, ru = false) {
  if (ru) return value;
  return ({ 'Исполнен': 'to‘liq bajarilgan', 'Исполнен(Частично)': 'qisman bajarilgan',
    'Оплачен': 'to‘langan', 'Ждёт оплату': 'to‘lovni kutmoqda', 'Новый': 'yangi',
    'Не подписан': 'imzolanmagan', 'Заключен': 'tuzilgan',
    'Аннулирован(Не оплачен)': 'to‘lanmagani uchun bekor qilingan' })[value] || value;
}
export function displayTerms(terms, ru = false) {
  const names = { мука: 'un', хлопок: 'paxta', пшеница: 'bug‘doy', сахар: 'shakar', цемент: 'sement', медь: 'mis', бензин: 'benzin', дизель: 'dizel' };
  return terms.map(term => ru ? term : names[term] || term.replace(/сорт/g, 'sort')).join(', ');
}
function calendarDate(value) {
  return value.split('-').reverse().join('.');
}
export function periodText(filters, ru = false) {
  const { dateFrom: from, dateTo: to } = filters;
  if (!from && !to) return '';
  if (from && to && /^\d{4}-01-01$/.test(from) && to === `${Number(from.slice(0, 4)) + 1}-01-01`) {
    return ru ? `За ${from.slice(0, 4)} год` : `${from.slice(0, 4)}-yilda`;
  }
  const end = to ? new Date(new Date(to + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10) : null;
  if (from && from === end) return ru ? `За ${calendarDate(from)}` : `${calendarDate(from)} kuni`;
  if (from && end) return ru ? `За период ${calendarDate(from)}–${calendarDate(end)}` : `${calendarDate(from)}–${calendarDate(end)} oralig‘ida`;
  if (from) return ru ? `С ${calendarDate(from)}` : `${calendarDate(from)} sanasidan boshlab`;
  return ru ? `По ${calendarDate(end)} включительно` : `${calendarDate(end)} sanasigacha`;
}
