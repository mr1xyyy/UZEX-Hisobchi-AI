import { normalize } from './normalize.js';
import { isRussian } from './locale.js';

export function explainUnavailableMetric(query, language) {
  const text = normalize(query);
  const profit = /(?:^|\s)(?:foyda[\p{L}]*|profit[\p{L}]*|прибыл[\p{L}]*|рентабельност[\p{L}]*|marja[\p{L}]*|марж[\p{L}]*)(?=\s|$)/u.test(text);
  if (!profit) return null;
  const years = [...text.matchAll(/(?:^|\s)((?:19|20)\d{2})(?=\s|$)/g)].map(match => match[1]);
  const year = years.length === 1 ? years[0] : null;
  if (isRussian(query, language)) {
    return 'По реестру сделок нельзя определить, какая компания получила наибольшую чистую прибыль: в базе нет расходов и себестоимости компаний.\n\n' +
      'Можно сравнить продавцов по сумме зарегистрированных сделок. Например:\n' +
      `«Покажи топ-5 продавцов по сумме сделок${year ? ' за ' + year + ' год' : ''}».\n\n` +
      'Сумма сделок не равна чистой прибыли.';
  }
  return 'Qaysi kompaniya eng ko‘p sof foyda ko‘rganini aniqlab bo‘lmaydi: bazada kompaniyalarning xarajatlari va mahsulot tannarxi yo‘q.\n\n' +
    'Kompaniyalarni reyestrdagi bitimlar summasi bo‘yicha solishtirish mumkin. Masalan:\n' +
    `«${year ? year + '-yilda ' : ''}bitimlar summasi eng katta 5 ta sotuvchi kompaniyani ko‘rsat».\n\n` +
    'Bitimlar summasi sof foyda degani emas.';
}
