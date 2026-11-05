import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainUnavailableMetric } from '../tgcloud/lib/business_limits.js';

test('profit questions explain missing expenses without presenting sales as profit', () => {
  const reply = explainUnavailableMetric('2025-yilda eng ko‘p foyda ko‘rgan kompaniya');
  assert.match(reply, /xarajatlari va mahsulot tannarxi yo‘q/);
  assert.match(reply, /2025-yilda bitimlar summasi eng katta 5 ta sotuvchi/);
  assert.match(reply, /Bitimlar summasi sof foyda degani emas/);
  assert.doesNotMatch(reply, /Ma'lumotlarda javob yoʻq/);
  const russian = explainUnavailableMetric('Какая компания получила наибольшую прибыль в 2024 году?');
  assert.match(russian, /расходов и себестоимости/);
  assert.match(russian, /за 2024 год/);
});
test('supported sales and price questions are not intercepted', () => {
  for (const question of ['2025-yilda bitimlar summasi eng katta kompaniya', 'Paxta narxi qancha?', 'Топ-5 продавцов по сумме сделок']) {
    assert.equal(explainUnavailableMetric(question), null);
  }
});
