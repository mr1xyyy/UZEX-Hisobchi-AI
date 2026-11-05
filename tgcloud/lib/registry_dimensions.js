import { normalize } from './normalize.js';

export function productGrade(product) {
  const text = normalize(product);
  // A grade before "сорт" takes precedence over numbers after it (class 1).
  const direct = /(?:^|\s)(\d+|iii|ii|iv|i|v|первый|второй|третий)\s+сорт(?=\s|$)/u.exec(text);
  const reverse = direct ? null : /(?:^|\s)сорт\s+(\d+|iii|ii|iv|i|v|первый|второй|третий)(?=\s|$)/u.exec(text);
  const value = direct?.[1] || reverse?.[1];
  return ({ i: '1', ii: '2', iii: '3', iv: '4', v: '5', первый: '1', второй: '2', третий: '3' })[value] || value || null;
}

const regions = {
  andijon: ['andijon', 'андижан'], buxoro: ['buxoro', 'бухар'],
  fargona: ['fargona', 'ферган'], jizzax: ['jizzax', 'джизак'],
  namangan: ['namangan', 'наманган'], navoiy: ['navoiy', 'навои'],
  qashqadaryo: ['qashqadaryo', 'кашкадар'], qoraqalpogiston: ['qoraqalpogiston', 'каракалпак'],
  samarqand: ['samarqand', 'самарканд'], sirdaryo: ['sirdaryo', 'сырдар'],
  surxondaryo: ['surxondaryo', 'сурхандар'], xorazm: ['xorazm', 'хорезм'],
};
export function canonicalRegion(input) {
  const text = normalize(input);
  if (text.includes('toshkent') || text.includes('ташкент')) {
    if (/shah|city|город|г ташкент/u.test(text)) return 'toshkent_city';
    return /viloy|region|област/u.test(text) ? 'toshkent_region' : null;
  }
  for (const [key, names] of Object.entries(regions)) if (names.some(name => text.includes(name))) return key;
  return null;
}
export function regionName(key, ru = false) {
  const names = {
    andijon: ['Andijon viloyati', 'Андижанская область'], buxoro: ['Buxoro viloyati', 'Бухарская область'],
    fargona: ['Farg‘ona viloyati', 'Ферганская область'], jizzax: ['Jizzax viloyati', 'Джизакская область'],
    namangan: ['Namangan viloyati', 'Наманганская область'], navoiy: ['Navoiy viloyati', 'Навоийская область'],
    qashqadaryo: ['Qashqadaryo viloyati', 'Кашкадарьинская область'], qoraqalpogiston: ['Qoraqalpog‘iston Respublikasi', 'Республика Каракалпакстан'],
    samarqand: ['Samarqand viloyati', 'Самаркандская область'], sirdaryo: ['Sirdaryo viloyati', 'Сырдарьинская область'],
    surxondaryo: ['Surxondaryo viloyati', 'Сурхандарьинская область'], xorazm: ['Xorazm viloyati', 'Хорезмская область'],
    toshkent_city: ['Toshkent shahri', 'город Ташкент'], toshkent_region: ['Toshkent viloyati', 'Ташкентская область'],
  };
  return names[key]?.[ru ? 1 : 0] || key;
}
