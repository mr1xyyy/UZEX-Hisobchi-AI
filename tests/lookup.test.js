import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDirectLookup, lookupReply } from '../tgcloud/lib/lookup_reply.js';
import { NO_ANSWER } from '../tgcloud/lib/normalize.js';

test('bare lookups and complete questions use separate response paths', () => {
  for (const query of ['1-sorta', 'I сорт', 'сорт 1', 'un', 'мука', 'BK001', '123456789']) assert.equal(isDirectLookup(query), true, query);
  for (const query of ['1-sorta narxi qancha', 'eng arzon un', 'un jami qancha', 'средняя цена муки', '1-sorta haqida malumot bering']) assert.equal(isDirectLookup(query), false, query);
});
test('lookup replies do not invent missing exchange rates and preserve the empty guardrail', () => {
  assert.equal(lookupReply('un', '{"records":[]}'), NO_ANSWER);
  assert.equal(lookupReply('un', 'invalid'), NO_ANSWER);
  const reply = lookupReply('un', JSON.stringify({ records: [{ deal_number: 5,
    product_name: 'Мука', deal_date: '2026-01-01', volume: 20, unit: 'тонна',
    unit_price: 10, unit_price_uzs: null }] }));
  assert.match(reply, /Bitim №5/);
  assert.match(reply, /so‘m\): noma’lum/);
  assert.doesNotMatch(reply, /10 UZS/);
});
