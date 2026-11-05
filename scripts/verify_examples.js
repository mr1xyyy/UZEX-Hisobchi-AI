import { readCsv, date, number } from './csv.js';
import { normalize } from '../tgcloud/lib/normalize.js';
import { writeFile } from 'node:fs/promises';
import { productGrade } from '../tgcloud/lib/registry_dimensions.js';

const dir = process.argv[2] || '../uzex_spot_data';
const contracts = new Map(), rates = new Map(), people = new Map();
for await (const r of readCsv(`${dir}/contracts.csv`)) contracts.set(r['Номер контракта'], r);
for await (const r of readCsv(`${dir}/usd_rates.csv`)) rates.set(date(r['Дата']), number(r['Курс']));
for await (const r of readCsv(`${dir}/participants.csv`)) people.set(r['ИНН'], r['Наименование']);
const results = {};
for (const scope of ['all', 'spot']) for (const annulled of ['include', 'exclude']) results[scope + '_' + annulled] = {
  buyers: new Map(), wheat: { volume: 0, tonnes: 0, count: 0, units: {} },
  cotton: { amount: 0, kg: 0, priceSum: 0, count: 0, units: {}, names: new Set() },
  total: 0, exports: 0, namangan: 0,
};
for (const year of [2023, 2024, 2025]) {
  for await (const r of readCsv(`${dir}/deals_${year}.csv`)) {
    const c = contracts.get(r['Номер контракта']);
    const amount = number(r['Сумма сделки']) * (r['Тип контракта'] === 'Экспортный' || c['Валюта'] === 'Доллар США' ? rates.get(date(r['Дата сделки'])) : 1);
    const volume = number(r['Количество']) * number(r['Лот']);
    const name = ' ' + normalize(r['Наименование товара']) + ' ';
    for (const [key, out] of Object.entries(results)) {
      if (key.startsWith('spot') && r['Форма контракта'] !== 'Спот') continue;
      if (key.endsWith('exclude') && r['Состояние сделки'].startsWith('Аннулирован')) continue;
      if (year === 2024) out.buyers.set(r['ИНН покупателя'], (out.buyers.get(r['ИНН покупателя']) || 0) + amount);
      if (year === 2023 && r['Регион'] === 'Namangan viloyati') out.namangan++;
      if (year === 2025) {
        out.total += amount;
        if (r['Тип контракта'] === 'Экспортный') out.exports += amount;
        if (name.includes('пшениц') && r['Регион'] === 'Samarqand viloyati') {
          out.wheat.count++; out.wheat.volume += volume;
          out.wheat.units[r['Единица измерения']] = (out.wheat.units[r['Единица измерения']] || 0) + 1;
          out.wheat.tonnes += r['Единица измерения'] === 'килограмм' ? volume / 1000 : volume;
        }
        if (name.includes('хлоп') && (name.includes('сырец') || name.includes('хом')) && productGrade(r['Наименование товара']) === '1') {
          const kg = r['Единица измерения'] === 'тонна' ? volume * 1000 : volume;
          out.cotton.amount += amount; out.cotton.kg += kg;
          out.cotton.priceSum += amount / kg; out.cotton.count++;
          out.cotton.units[r['Единица измерения']] = (out.cotton.units[r['Единица измерения']] || 0) + 1;
          out.cotton.names.add(r['Наименование товара']);
        }
      }
    }
  }
  console.log(year + ' checked');
}
for (const out of Object.values(results)) {
  out.buyers = [...out.buyers].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([inn, amount]) => ({ inn, name: people.get(inn), amount }));
  out.exportPercent = out.exports / out.total * 100;
  out.cotton.weighted = out.cotton.amount / out.cotton.kg;
  out.cotton.simple = out.cotton.priceSum / out.cotton.count;
  out.cotton.names = [...out.cotton.names];
}
await writeFile('EXAMPLE_VERIFICATION.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
