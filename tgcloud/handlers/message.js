// handlers/message.js — runs on each `message` update. The file name is the
// Telegram update type; the platform calls the default export with the matching
// payload (here, a Message). The full update is available as `ctx.update`.

import { api } from 'sdk';
import { searchRegistry } from '../lib/rag_search.js';
import { NO_ANSWER } from '../lib/normalize.js';
import { isDirectLookup, lookupReply } from '../lib/lookup_reply.js';
import { answerRegistryCount } from '../lib/registry_count.js';
import { answerQuestion } from '../lib/question_answer.js';
import { explainUnavailableMetric } from '../lib/business_limits.js';
import { noDataReply } from '../lib/no_data_reply.js';
import { handleUserCommand } from '../lib/user_commands.js';
import { isRussian } from '../lib/locale.js';

export default async function (message) {
  if (!message?.chat?.id || typeof message.text !== 'string') return;
  const text = message.text.trim();
  let answer;
  let language;
  try {
    if (await handleUserCommand(message)) return;
    answer = explainUnavailableMetric(text, language) ?? await answerRegistryCount(text, language);
    if (answer === null) {
      if (isDirectLookup(text)) {
        const result = await searchRegistry(text);
        answer = result.found ? lookupReply(text, result.context, 3, language) : NO_ANSWER;
      } else answer = await answerQuestion(text, { language });
    }
  } catch {
    answer = isRussian(text, language) ? 'Временная ошибка сервиса. Повторите позже.'
      : 'Xizmatda vaqtinchalik xatolik. Keyinroq qayta urinib ko‘ring.';
  }
  if (answer === NO_ANSWER) answer = noDataReply(text, 'no_match', null, language);
  let last;
  while (answer.length) {
    let end = Math.min(answer.length, 4000);
    if (end < answer.length) {
      const line = answer.lastIndexOf('\n', end);
      if (line > 0) end = line;
    }
    last = await api.sendMessage({ chat_id: message.chat.id, text: answer.slice(0, end),
      reply_markup: { remove_keyboard: true } });
    answer = answer.slice(end).trimStart();
  }
  return last;
}
