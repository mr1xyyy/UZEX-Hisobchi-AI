import { createRunner, safeServerDescription } from './import_data.js';

try {
  const run = await createRunner({ entrySource:
    "import diagnose from '../lib/diagnostics.js';\nexport default async function (input) { return await diagnose(input); }" });
  const args = process.argv.slice(2);
  const answer = args.includes('--answer');
  const result = await run({ query: args.filter(arg => arg !== '--answer').join(' ') || '1-sorta', answer });
  console.log(JSON.stringify(result, null, 2));
  if (result.backend === 'sqlite') console.log('Bot hali SQLite’da. Neon import tugagan bo‘lsa: node scripts/import_neon.js --configure');
  if (result.found) console.log('Lokal kod bilan qidiruv ishladi. Deployni yangilash: npx tgcloud push');
  if (!result.deepseekConfigured) console.log('DeepSeek kaliti belgilanmagan: node scripts/import_data.js --configure');
  console.log(answer ? 'Bu tekshiruv Telegramga xabar yubormaydi; to‘liq savol uchun DeepSeek rejalashtiruvchisi chaqirilishi mumkin.'
    : 'Bu tekshiruv Telegramga xabar yubormaydi va DeepSeek API’ni chaqirmaydi.');
} catch (error) {
  console.error(safeServerDescription(error.message) || 'Bot diagnostikasi bajarilmadi.');
  process.exitCode = 1;
}
