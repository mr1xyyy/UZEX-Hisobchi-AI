import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRegion, productGrade } from '../tgcloud/lib/registry_dimensions.js';

test('grade extraction never confuses class 1 with grade 1', () => {
  for (const name of ['ХЛОПОК-СЫРЕЦ 2 СОРТ 1-КЛАСС', 'Хлопок третий сорт I класс', 'Хлопок II сорт I класс']) assert.notEqual(productGrade(name), '1', name);
  for (const name of ['Хлопок 1-сорта 2 класс', 'Хлопок Сорт I сорт Класс II класс', 'Хлопок сорт 1', 'Хлопок первый сорт']) assert.equal(productGrade(name), '1', name);
  assert.equal(productGrade('Пшеница Класс 1-класс'), null);
});
test('Uzbek and Russian regions have identical canonical keys', () => {
  assert.equal(canonicalRegion('Samarqand viloyati'), 'samarqand');
  assert.equal(canonicalRegion('Самаркандской области'), 'samarqand');
  assert.equal(canonicalRegion('Namangan viloyatida'), 'namangan');
  assert.equal(canonicalRegion('Ташкентская область'), 'toshkent_region');
  assert.equal(canonicalRegion('Toshkent shahri'), 'toshkent_city');
  assert.equal(canonicalRegion('toshkent_city'), 'toshkent_city');
  assert.equal(canonicalRegion('Toshkent'), null);
});
