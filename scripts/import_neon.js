import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { importData, createRunner, fetchWithRetry, safeServerDescription } from './import_data.js';
import { neonConnection, neonQuery } from '../tgcloud/lib/neon_http.js';
import { schemaStatements, indexStatements, buildBulkInsert, countQuery } from './neon_schema.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function importNeon({ connectionString, directory, checkpointPath, query }) {
  for (const statement of schemaStatements) await query(statement);
  // A failed/partial import must never be presented as ready for initial activation.
  await query("INSERT INTO uzex.import_state (id,value) VALUES ('ready','false') ON CONFLICT(id) DO UPDATE SET value=excluded.value");
  const counts = await importData({ directory, checkpointPath, batchSize: 1000, maxBatchBytes: 1000000, spotOnly: false,
    run: async input => {
      if (input.action === 'fts') {
        console.log('Neon: qidiruv indekslari yaratilmoqda...');
        for (const statement of indexStatements) await query(statement);
        return { fts: true, backend: 'neon' };
      }
      const insert = buildBulkInsert(input.table, input.rows);
      await query(insert.query, insert.params);
      return { processed: input.rows.length };
    },
  });
  const actual = (await query(countQuery))[0];
  const expected = { contracts: counts['contracts.csv'], participants: counts['participants.csv'],
    brokers: counts['brokers.csv'], usd_rates: counts['usd_rates.csv'],
    deals: Object.entries(counts).filter(([name]) => /^deals_/.test(name)).reduce((sum, [, count]) => sum + count, 0) };
  for (const [table, count] of Object.entries(expected)) {
    if (Number(actual?.[table]) !== count) throw new Error(`Neon ${table}: yozuv soni mos emas (kutilgan ${count}, mavjud ${actual?.[table] ?? 'noma’lum'}). Baza yoki progress faylini tekshiring.`);
  }
  await query("INSERT INTO uzex.import_state (id,value) VALUES ('profile','all-v2') ON CONFLICT(id) DO UPDATE SET value=excluded.value");
  await query("UPDATE uzex.import_state SET value='true' WHERE id='ready'");
  return actual;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg.startsWith('--') && !['--configure', '--check', '--dry-run'].includes(arg))) throw new Error('Buyruq parametri noma’lum. --configure, --check yoki --dry-run ishlating.');
  const directory = resolve(args.find(arg => !arg.startsWith('--')) || join(root, '..', 'uzex_spot_data'));
  if (args.includes('--dry-run')) { await importData({ directory, dryRun: true, spotOnly: false }); return; }
  const connectionString = process.env.DATABASE_URL;
  const { identity } = neonConnection(connectionString);
  const query = (sql, params) => neonQuery((url, options) => fetchWithRetry(url, options, {
    serviceName: 'Neon',
  }), connectionString, sql, params);
  if (args.includes('--configure')) {
    const botUrl = process.env.NEON_BOT_DATABASE_URL || connectionString;
    neonConnection(botUrl);
    const ready = await neonQuery(globalThis.fetch, botUrl, "SELECT value FROM uzex.import_state WHERE id='ready'");
    if (ready[0]?.value !== 'true') throw new Error('Neon import hali tugamagan. Avval import:neon ni bajaring.');
    const run = await createRunner();
    const result = await run({ action: 'configure_neon', databaseUrl: botUrl });
    if (!result?.configured || result.backend !== 'neon') throw new Error('Botning Neon sozlamasi tasdiqlanmadi.');
    console.log('Bot Neon bazasiga ulandi. Endi npx tgcloud push bajaring.'); return;
  }
  if (args.includes('--check')) { console.table(await query(countQuery)); return; }
  const id = createHash('sha256').update(identity + '\n' + directory + '\nall-v2').digest('hex').slice(0, 24);
  const checkpointPath = join(root, '.import-progress', `neon-v2-${id}.json`);
  console.log('CSV → Neon v2: barcha savdo turlari, hudud va sort qayta to‘ldiriladi. Mavjud bitimlar yangilanadi; bazani o‘chirish kerak emas.');
  console.table([await importNeon({ connectionString, directory, checkpointPath, query })]);
  console.log('Neon import tugadi. Botni ulash: node scripts/import_neon.js --configure');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(safeServerDescription(error.message) || 'Neon import bajarilmadi.');
  process.exitCode = 1;
});
