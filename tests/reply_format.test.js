import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, periodText, displayTerms, displayStatus } from '../tgcloud/lib/reply_format.js';

test('numbers are grouped and rounded for display without changing calculations', () => {
  assert.equal(formatNumber(2621400340149.8916), '2 621 400 340 149.89');
  assert.equal(formatNumber(2621400340149.8916, true), '2 621 400 340 149,89');
  assert.equal(formatNumber(106761), '106 761');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(null), 'noma’lum');
});
test('exclusive SQL dates become natural inclusive periods', () => {
  assert.equal(periodText({ dateFrom: '2024-01-01', dateTo: '2025-01-01' }), '2024-yilda');
  assert.equal(periodText({ dateFrom: '2024-01-01', dateTo: '2025-01-01' }, true), 'За 2024 год');
  assert.equal(periodText({ dateFrom: '2024-02-01', dateTo: '2024-03-01' }), '01.02.2024–29.02.2024 oralig‘ida');
  assert.equal(periodText({ dateFrom: '2024-02-29', dateTo: '2024-03-01' }), '29.02.2024 kuni');
  assert.equal(displayTerms(['мука', '1 сорт']), 'un, 1 sort');
  assert.equal(displayStatus('Исполнен'), 'to‘liq bajarilgan');
});
