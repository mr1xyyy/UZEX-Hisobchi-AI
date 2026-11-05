import { api } from 'sdk';

const messages = {
  uz: {
    start: 'Assalomu alaykum! UZEX bitimlari bo‘yicha savolingizni yozing.\n\nMasalan: «2025-yilda paxta bo‘yicha nechta bitim bo‘lgan?»\n\n/help — foydalanish bo‘yicha yordam',
    help: 'Savolingizni oddiy gap bilan yozing. Mahsulot va davrni ko‘rsatsangiz, javob aniqroq bo‘ladi.\n\nMisollar:\n• 2025-yilda nechta bitim bo‘lgan?\n• 2024-yilda eksport summasi qancha?\n• Unning o‘rtacha narxi qancha?\n• Bitimlar summasi eng katta 5 ta sotuvchini ko‘rsat.\n\nFaqat reyestrdagi ma’lumotlarga asoslanaman. Ma’lumot yetishmasa, sababini tushuntiraman.\n\n/start — boshlash\n/help — yordam',
    unknown: 'Bu komanda mavjud emas. /start yoki /help dan foydalaning.',
  },
  ru: {
    start: 'Здравствуйте! Задайте вопрос о сделках UZEX.\n\nНапример: «Сколько сделок по хлопку было в 2025 году?»\n\n/help — помощь',
    help: 'Задайте вопрос обычным текстом. Для более точного ответа укажите товар и период.\n\nПримеры:\n• Сколько сделок было в 2025 году?\n• Какова сумма экспортных сделок за 2024 год?\n• Какова средняя цена муки?\n• Покажи топ-5 продавцов по сумме сделок.\n\nЯ отвечаю только по данным реестра. Если информации недостаточно, объясню причину.\n\n/start — начало\n/help — помощь',
    unknown: 'Такой команды нет. Используйте /start или /help.',
  },
};
export async function handleUserCommand(message) {
  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(message.text.trim());
  if (!match) return false;
  const command = match[1].toLowerCase();
  let text, reply_markup = { remove_keyboard: true };
  const key = ['start', 'help'].includes(command) ? command : 'unknown';
  text = 'O‘zbekcha\n' + messages.uz[key] + '\n\n──────────\n\nРусский\n' + messages.ru[key];
  await api.sendMessage({ chat_id: message.chat.id, text, reply_markup });
  return true;
}
