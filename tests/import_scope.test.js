import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importData } from '../scripts/import_data.js';
import { buildBulkInsert, schemaStatements } from '../scripts/neon_schema.js';

test('v2 converter imports all forms with region and grade; upsert backfills old rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'uzex-scope-'));
  try {
    await writeFile(join(directory, 'contracts.csv'), 'Номер контракта,Валюта\n1,Узбекский сум');
    await writeFile(join(directory, 'participants.csv'), 'ИНН,Наименование\n111111111,Seller\n222222222,Buyer');
    await writeFile(join(directory, 'brokers.csv'), 'Код брокера,Наименование\nBK001,Seller broker\nBK002,Buyer broker');
    await writeFile(join(directory, 'usd_rates.csv'), 'Дата,Курс\n01.01.2025,12000');
    const headers = ['Номер сделки', 'Дата сделки', 'Наименование товара', 'Количество', 'Сумма сделки', 'Стартовая цена',
      'Номер контракта', 'Тип контракта', 'Единица измерения', 'Лот', 'Состояние сделки', 'ИНН продавца', 'ИНН покупателя',
      'Брокер продавца', 'Брокер покупателя', 'Регион', 'Форма контракта'];
    const rows = ['Спот', 'Форвард', 'Фьючерс'].map((form, i) => [i + 1, '01.01.2025', 'Хлопок 2 сорт 1 класс', 1, 100, 100,
      '1', 'Внутренний', 'килограмм', 1, 'Исполнен', '111111111', '222222222', 'BK001', 'BK002', 'Namangan viloyati', form].join(','));
    await writeFile(join(directory, 'deals_2025.csv'), headers.join(',') + '\n' + rows.join('\n'));
    const uploaded = [];
    const counts = await importData({ directory, spotOnly: false, run: async input => {
      if (input.action) return { fts: true };
      if (input.table === 'deals') uploaded.push(...input.rows);
      return { processed: input.rows.length };
    } });
    assert.equal(counts['deals_2025.csv'], 3);
    assert.deepEqual(uploaded.map(row => row.tradeForm), ['Спот', 'Форвард', 'Фьючерс']);
    assert.ok(uploaded.every(row => row.region === 'namangan' && row.productGrade === '2'));
    const sql = buildBulkInsert('deals', uploaded);
    assert.match(sql.query, /DO UPDATE SET/);
    assert.match(sql.query, /product_grade=excluded.product_grade/);
    assert.ok(schemaStatements.some(sql => sql.includes('ADD COLUMN IF NOT EXISTS region')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
