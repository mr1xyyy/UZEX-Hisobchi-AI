import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noDataReply } from '../tgcloud/lib/no_data_reply.js';

test('missing-data replies explain the reason and offer a next step in the user language', () => {
  assert.match(noDataReply('un'), /mos yozuv reyestrdan topilmadi/);
  assert.match(noDataReply('Покажи муку'), /Попробуйте другой период/);
  assert.match(noDataReply('summa', 'missing_rate'), /kurs yetishmayapti/);
  assert.match(noDataReply('hajm', 'missing_volume'), /miqdor yoki lot yo‘q/);
  assert.match(noDataReply('qandaydir savol', 'unclear'), /aniq ajrata olmadim/);
  assert.match(noDataReply('2030-yildagi savdo', 'no_match', { min_date: '2022-01-03', max_date: '2026-10-30' }), /2022-01-03 — 2026-10-30/);
  assert.doesNotMatch(noDataReply('un'), /Ma'lumotlarda javob yoʻq|sun’iy/);
});
