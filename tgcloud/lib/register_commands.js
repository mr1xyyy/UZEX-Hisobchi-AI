import { api } from 'sdk';

export default async function () {
  const commands = [{ command: 'start', description: 'Boshlash / Начать' },
    { command: 'help', description: 'Yordam / Помощь' }];
  await api.setMyCommands({ commands });
  await api.setMyCommands({ commands, language_code: 'uz' });
  await api.setMyCommands({ commands, language_code: 'ru' });
  return { registered: ['start', 'help'] };
}
