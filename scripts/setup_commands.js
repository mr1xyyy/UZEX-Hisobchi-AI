import { createRunner, safeServerDescription } from './import_data.js';

try {
  const run = await createRunner({ entrySource:
    "import register from '../lib/register_commands.js';\nexport default async function () { return await register(); }" });
  const result = await run({});
  if (result?.registered?.join(',') !== 'start,help') throw new Error('Commands were not confirmed');
  console.log('Telegram menyusi yangilandi: /start, /help');
} catch (error) {
  console.error(safeServerDescription(error.message) || 'Komandalar menyusi sozlanmadi.');
  process.exitCode = 1;
}
