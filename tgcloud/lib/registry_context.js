import { calculateDeal } from './normalize.js';
export function registryContext(rows) {
  if (!rows.length) return { found: false, context: null };
  return { found: true, context: JSON.stringify({
    source: 'uzex_spot_data — sun’iy / вымышленные данные',
    scope: 'Faqat namuna. Butun reyestr bo‘yicha jami, o‘rtacha va reyting noma’lum.',
    truncated: rows.length > 15, rules: 'Null — noma’lum; kursni taxmin qilmang. Bitim raqamini keltiring.',
    records: rows.slice(0, 15).map(calculateDeal),
  }) };
}
