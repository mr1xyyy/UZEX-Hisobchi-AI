import { db, fetch } from 'sdk';
import { neonQuery } from './neon_http.js';
import { deals, usdRates, contracts, participants, brokers } from '../schema.js';
const tables = { deals, usdRates, contracts, participants, brokers };
const keys = { deals: deals.dealNumber, usdRates: usdRates.date, contracts: contracts.number,
  participants: participants.inn, brokers: brokers.code };

// Called only through the authenticated management /run API, never a public endpoint.
export default async function importBatch(input) {
  if (input.action === 'configure_neon') {
    // Verify tgcloud can reach and read the target before changing routing.
    const ready = await neonQuery(fetch, input.databaseUrl, "SELECT value FROM uzex.import_state WHERE id='ready'");
    if (ready[0]?.value !== 'true') throw new Error('Neon import hali tugamagan.');
    const rows = await neonQuery(fetch, input.databaseUrl,
      'SELECT deal_number FROM uzex.deals LIMIT 1');
    if (!rows.length) throw new Error('Neon deals jadvali bo‘sh. Avval importni tugating.');
    await db.run("INSERT INTO settings (key,value) VALUES ('neon_database_url', :url) ON CONFLICT(key) DO UPDATE SET value=excluded.value", { ':url': input.databaseUrl });
    return { configured: true, backend: 'neon' };
  }
  if (input.action === 'configure') {
    if (typeof input.apiKey !== 'string' || !input.apiKey.trim()) throw new Error('Missing API key');
    await db.run("INSERT INTO settings (key,value) VALUES ('deepseek_api_key', :key) ON CONFLICT(key) DO UPDATE SET value=excluded.value", { ':key': input.apiKey });
    return { configured: true };
  }
  if (input.action === 'fts') {
    try {
      await db.run("CREATE VIRTUAL TABLE IF NOT EXISTS deals_fts USING fts5(search_text, content='deals', content_rowid='deal_number', tokenize='unicode61')");
      await db.run("CREATE TRIGGER IF NOT EXISTS deals_ai AFTER INSERT ON deals BEGIN INSERT INTO deals_fts(rowid,search_text) VALUES(new.deal_number,new.search_text); END");
      await db.run("CREATE TRIGGER IF NOT EXISTS deals_ad AFTER DELETE ON deals BEGIN INSERT INTO deals_fts(deals_fts,rowid,search_text) VALUES('delete',old.deal_number,old.search_text); END");
      await db.run("CREATE TRIGGER IF NOT EXISTS deals_au AFTER UPDATE ON deals BEGIN INSERT INTO deals_fts(deals_fts,rowid,search_text) VALUES('delete',old.deal_number,old.search_text); INSERT INTO deals_fts(rowid,search_text) VALUES(new.deal_number,new.search_text); END");
      await db.run("INSERT INTO deals_fts(deals_fts) VALUES('rebuild')");
      return { fts: true };
    } catch { return { fts: false, warning: 'FTS unavailable or rebuild failed; LIKE search remains available.' }; }
  }
  const table = tables[input.table];
  if (!table || !Array.isArray(input.rows) || input.rows.length > 300) throw new Error('Invalid batch');
  if (!input.rows.length) return { inserted: 0 };
  // Keep each SQL statement below SQLite's parameter limit while amortizing
  // the management request over multiple statements. Replays are idempotent.
  for (let offset = 0; offset < input.rows.length; offset += 30) {
    await db.insert(table).values(input.rows.slice(offset, offset + 30))
      .onConflictDoNothing({ target: keys[input.table] }).run();
  }
  return { processed: input.rows.length };
}
