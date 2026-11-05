export const NO_ANSWER = "Ma'lumotlarda javob yoʻq";
export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[’‘ʻʼ`']/g, '').replace(/ё/g, 'е')
    .replace(/(\d)\s*-?\s*(?:sorta|sort|сорта|сорт)/gu, '$1 сорт')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const aliases = { paxta: 'хлопок', bugdoy: 'пшеница', un: 'мука', shakar: 'сахар', sement: 'цемент', mis: 'медь', benzin: 'бензин', dizel: 'дизель' };
const stop = new Set(('haqida malumot bering qanday qancha narxi narx bitim bitimlar sotuvchi xaridor broker stir inn va uchun boyicha bor eng jami ortacha о об по и в на за какой какая сколько цена сделки сделка продавец покупатель брокер инн покажи расскажи').split(' '));
export function queryTerms(query) {
  const grades = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', первый: '1', второй: '2', третий: '3' };
  const normalized = normalize(query)
    .replace(/\b(iii|ii|iv|i|v)\s+сорт/gu, (_, grade) => grades[grade] + ' сорт')
    .replace(/(^|\s)(первый|второй|третий)\s+сорт/gu, (_, space, grade) => space + grades[grade] + ' сорт')
    .replace(/(^|\s)сорт\s+(\d+)(?=\s|$)/gu, '$1$2 сорт');
  return (normalized.match(/\d+ сорт|[\p{L}\p{N}]+/gu) || [])
    .filter(t => !stop.has(t)).map(t => aliases[t] || t).slice(0, 12);
}
export function isGrade(term) { return /^\d+ сорт$/.test(term); }
export function searchPatterns(term) {
  if (!isGrade(term)) return ['%' + term.replace(/[\\%_]/g, '\\$&') + '%'];
  const grade = term.split(' ')[0];
  const variants = { 1: ['i', 'первый'], 2: ['ii', 'второй'], 3: ['iii', 'третий'], 4: ['iv'], 5: ['v'] };
  return [grade, ...(variants[grade] || [])].flatMap(value => [`% ${value} сорт %`, `% сорт ${value} %`]);
}
export function calculateDeal(row) {
  const volume = row.quantity * row.lot;
  const usd = row.contract_type === 'Экспортный' || /USD|Доллар США/i.test(row.currency || '');
  const known = usd || /UZS|Узбекский сум/i.test(row.currency || '');
  const factor = usd ? (row.usd_rate > 0 ? row.usd_rate : null) : known ? 1 : null;
  return { ...row, volume, unit_price: volume > 0 ? row.total_amount / volume : null,
    total_uzs: factor === null ? null : row.total_amount * factor,
    unit_price_uzs: factor === null || volume <= 0 ? null : row.total_amount * factor / volume };
}
