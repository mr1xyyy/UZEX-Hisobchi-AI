import { readFile, readdir, stat, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, number, date } from './csv.js';
import { normalize } from '../tgcloud/lib/normalize.js';
import { canonicalRegion, productGrade } from '../tgcloud/lib/registry_dimensions.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
class ImportError extends Error {}
export async function fetchWithRetry(url, options, {
  fetchFn = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  warn = message => console.warn(message),
  serviceName = 'tgcloud',
} = {}) {
  // Import inserts ignore duplicate primary keys; configure writes the same key.
  // Retrying after an uncertain network result is safe for these operations.
  const retryable = new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
    'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED',
    'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH']);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetchFn(url, { ...options, signal: AbortSignal.timeout(30000) });
      // Consume the body here so a connection lost while reading also retries.
      const text = await response.text();
      if (response.status === 429 && attempt < 4) {
        let body;
        try { body = JSON.parse(text); } catch { /* Use backoff if no JSON body. */ }
        const header = response.headers?.get('retry-after');
        const seconds = header && /^\d+(?:\.\d+)?$/.test(header) ? Number(header)
          : header ? (Date.parse(header) - Date.now()) / 1000 : NaN;
        const suggested = Number(body?.parameters?.retry_after);
        const delay = Math.max(10000 * 2 ** (attempt - 1),
          Number.isFinite(seconds) ? seconds * 1000 : 0,
          Number.isFinite(suggested) ? suggested * 1000 : 0);
        warn(`${serviceName} limiti: ${Math.ceil(delay / 1000)} soniya kutiladi, keyin ayni batch qayta yuboriladi (${attempt + 1}/4).`);
        // Long Retry-After values are honored in chunks.
        for (let remaining = delay; remaining > 0; remaining -= 60000) await sleep(Math.min(remaining, 60000));
        continue;
      }
      return { ok: response.ok, status: response.status, json: async () => JSON.parse(text) };
    } catch (error) {
      const codes = [error?.cause?.code, ...(error?.cause?.errors || []).map(e => e.code)];
      const transient = error?.name === 'TimeoutError' || codes.some(code => retryable.has(code));
      if (!transient || attempt === 4) throw error;
      const delay = 1000 * 2 ** (attempt - 1);
      warn(`Ulanish uzildi. ${delay / 1000} soniyadan keyin qayta urinish (${attempt + 1}/4)...`);
      await sleep(delay);
    }
  }
}
export function networkError(error) {
  const codes = [error?.name, error?.cause?.code, ...(error?.cause?.errors || []).map(e => e.code)]
    .filter(code => typeof code === 'string' && /^[A-Za-z0-9_]+$/.test(code));
  const codeText = codes.join(', ') || 'UNKNOWN';
  let hint = 'Internet, VPN yoki proksi sozlamalarini tekshiring.';
  if (codes.some(c => /ENOTFOUND|EAI_AGAIN/.test(c))) hint = 'DNS cloud.telegram.org manzilini aniqlay olmadi.';
  if (codes.some(c => /CERT|TLS|SSL/.test(c))) hint = 'TLS sertifikatini tekshirish bajarilmadi. Kompyuter vaqti va ishonchli sertifikatlarni tekshiring.';
  if (codes.some(c => /TIMEOUT|TimeoutError|ETIMEDOUT/.test(c))) hint = 'Ulanish vaqti tugadi. Tarmoq yoki proksi ulanishini tekshiring.';
  return new ImportError(`cloud.telegram.org bilan ulanish bajarilmadi (${codeText}). ${hint}`);
}
export function safeServerDescription(value) {
  let text = typeof value === 'string' ? value : '';
  for (const secret of [process.env.TGCLOUD_TOKEN, process.env.DEEPSEEK_API_KEY, process.env.DATABASE_URL, process.env.NEON_BOT_DATABASE_URL]) {
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text.replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED]')
    .replace(/\bapp\d+:[^\s"',}]+/g, '[REDACTED]')
    .replace(/\bsk-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1800);
}
export function managementError(status, body) {
  const description = typeof body?.description === 'string' ? body.description : '';
  if (status === 401 || status === 403 || /unauthorized|invalid token|access denied/i.test(description)) {
    return new ImportError('TGCLOUD_TOKEN qabul qilinmadi. Bot tokeni emas, tgcloud management tokenini belgilang.');
  }
  if (/no such table|no such column|schema.*mismatch/i.test(description)) {
    return new ImportError('Baza sxemasi tayyor emas. Avval npx tgcloud push va npx tgcloud migrate bajaring.');
  }
  if (status === 429) return new ImportError('tgcloud so‘rovlar limitiga yetildi. Birozdan keyin qayta urinib ko‘ring.');
  const detail = safeServerDescription(description || (typeof body?.error === 'string' ? body.error : ''));
  return new ImportError(`tgcloud /run so‘rovi bajarilmadi (HTTP ${status}).${detail ? '\nServer: ' + detail : ' Server xato tavsifini qaytarmadi.'}`);
}
export async function createRunner({ entrySource } = {}) {
  const token = process.env.TGCLOUD_TOKEN;
  if (!token) throw new ImportError('TGCLOUD_TOKEN belgilanmagan. Shu PowerShell oynasida $env:TGCLOUD_TOKEN ni belgilang.');
  if (!/^app\d+:[\x21-\x39\x3b-\x7e]+$/.test(token)) throw new ImportError('TGCLOUD_TOKEN formati noto‘g‘ri. tgcloud management tokeni app<id>:<secret> formatida bo‘ladi; Telegram bot tokenidan foydalanmang.');
  const sources = {};
  async function collect(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) await collect(path);
      else if (item.name.endsWith('.js')) sources[relative(join(root, 'tgcloud'), path).split(sep).join('/').slice(0, -3)] = await readFile(path, 'utf8');
    }
  }
  await collect(join(root, 'tgcloud'));
  // Handler names must be Telegram update types. Override message only in this
  // ephemeral /run source map; neither local nor deployed message code changes.
  sources['handlers/message'] = entrySource || "import importBatch from '../lib/import_batch.js';\nexport default async function (input) { return await importBatch(input); }";
  let lastFinished = 0;
  let interval = Number(process.env.TGCLOUD_IMPORT_INTERVAL_MS || 20000);
  if (!Number.isFinite(interval) || interval < 1000 || interval > 60000) throw new ImportError('TGCLOUD_IMPORT_INTERVAL_MS 1000–60000 oralig‘ida bo‘lishi kerak.');
  return async args => {
    const pause = Math.max(0, lastFinished + interval - Date.now());
    if (pause) await new Promise(resolve => setTimeout(resolve, pause));
    let response;
    try { response = await fetchWithRetry(`https://cloud.telegram.org/${token.split(':')[0]}/manage/run`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: 'handlers/message', sources, args, ctx: {} }),
    }, { warn: message => {
      if (message.startsWith('tgcloud limiti:')) interval = Math.min(60000, interval + 5000);
      console.warn(message);
    } }); } catch (error) {
      throw networkError(error);
    } finally {
      lastFinished = Date.now();
    }
    let body;
    try { body = await response.json(); } catch {
      throw new ImportError(`tgcloud JSON javob qaytarmadi (HTTP ${response.status}). Ulanish yoki xizmat holatini tekshiring.`);
    }
    if (!response.ok || !body?.ok) throw managementError(response.status, body);
    if (!body.result || !Object.hasOwn(body.result, 'result')) throw new ImportError('tgcloud /run javob formati kutilgan formatga mos emas.');
    // /run result envelope: {ok:true,result:{result:<module return>,log,time}}.
    return body.result.result;
  };
}
export async function importData({ directory, dryRun = false, run, checkpointPath, batchSize = 300, maxBatchBytes = 128000, spotOnly = true }) {
  const contractMap = new Map(), people = new Map(), brokerMap = new Map();
  const counts = {};
  let progress = { version: 1, files: {} };
  if (!dryRun && checkpointPath) {
    try {
      progress = JSON.parse(await readFile(checkpointPath, 'utf8'));
      if (progress.version !== 1 || !progress.files) throw new Error('Invalid checkpoint');
    } catch (error) {
      if (error.code !== 'ENOENT') throw new ImportError('Import progress fayli o‘qilmadi. Uni tekshiring; yuklash davom ettirilmadi.');
    }
  }
  async function saveProgress(file, signature, count) {
    if (!checkpointPath || dryRun) return;
    progress.files[file] = { signature, count };
    await mkdir(dirname(checkpointPath), { recursive: true });
    await writeFile(checkpointPath + '.tmp', JSON.stringify(progress), { mode: 0o600 });
    await rename(checkpointPath + '.tmp', checkpointPath);
  }
  async function load(file, table, convert) {
    const info = await stat(join(directory, file));
    const signature = `${info.size}:${info.mtimeMs}`;
    const saved = progress.files[file];
    if (saved && saved.signature !== signature) throw new ImportError(`${file} o‘zgargan. Oldingi progress bilan davom ettirish mumkin emas.`);
    const skip = dryRun ? 0 : saved?.count || 0;
    if (skip) console.log(`${file}: ${skip} tasdiqlangan yozuvdan davom etadi.`);
    let batch = [], count = 0, batchBytes = 0;
    async function flush() {
      if (!batch.length) return;
      if (!dryRun) {
        const result = await run({ table, rows: batch });
        if (result?.processed !== batch.length) throw new ImportError('Batch tasdiqlanmadi; progress saqlanmadi.');
        await saveProgress(file, signature, count);
        console.log(`${file}: ${count} processed (tasdiqlangan)...`);
      }
      batch = []; batchBytes = 0;
    }
    for await (const row of readCsv(join(directory, file))) {
      const converted = convert(row);
      if (!converted) continue;
      // Rebuild lookup maps even when already-uploaded rows are skipped.
      if (count < skip) { count++; continue; }
      const bytes = Buffer.byteLength(JSON.stringify(converted), 'utf8');
      if (batch.length && batchBytes + bytes > maxBatchBytes) await flush();
      batch.push(converted); batchBytes += bytes; count++;
      if (batch.length === batchSize) await flush();
    }
    await flush();
    counts[file] = count;
    console.log(`${file}: ${count}${dryRun ? ' validated' : ' processed'}`);
  }
  await load('contracts.csv', 'contracts', r => {
    contractMap.set(r['Номер контракта'], r);
    return { number: r['Номер контракта'], currency: r['Валюта'], data: JSON.stringify(r) };
  });
  await load('participants.csv', 'participants', r => {
    people.set(r['ИНН'], r['Наименование']);
    return { inn: r['ИНН'], name: r['Наименование'], data: JSON.stringify(r) };
  });
  await load('brokers.csv', 'brokers', r => {
    brokerMap.set(r['Код брокера'], r['Наименование']);
    return { code: r['Код брокера'], name: r['Наименование'], data: JSON.stringify(r) };
  });
  await load('usd_rates.csv', 'usdRates', r => {
    const rate = number(r['Курс']);
    if (rate <= 0) throw new Error('Non-positive USD rate');
    return { date: date(r['Дата']), rate };
  });
  const files = (await readdir(directory)).filter(f => /^deals_\d{4}\.csv$/.test(f)).sort();
  if (!files.length) throw new Error('No deals CSV files found');
  for (const file of files) await load(file, 'deals', r => {
    if (spotOnly && r['Форма контракта'] !== 'Спот') return null;
    const contract = contractMap.get(r['Номер контракта']);
    if (!contract) throw new Error('Missing contract: ' + r['Номер контракта']);
    const item = { dealNumber: number(r['Номер сделки']), dealDate: date(r['Дата сделки']),
      productName: r['Наименование товара'], quantity: number(r['Количество']),
      totalAmount: number(r['Сумма сделки']), startPrice: number(r['Стартовая цена']),
      contractNumber: r['Номер контракта'], contractType: r['Тип контракта'], currency: contract['Валюта'],
      unit: r['Единица измерения'], lot: number(r['Лот']), status: r['Состояние сделки'],
      sellerInn: r['ИНН продавца'], buyerInn: r['ИНН покупателя'],
      sellerBroker: r['Брокер продавца'], buyerBroker: r['Брокер покупателя'] };
    item.region = canonicalRegion(r['Регион']);
    item.tradeForm = r['Форма контракта'];
    item.productGrade = productGrade(item.productName);
    if (!item.region) throw new Error('Unknown deal region: ' + item.dealNumber);
    if (![item.dealNumber, item.quantity, item.lot].every(Number.isSafeInteger) || item.quantity <= 0 || item.lot <= 0 || item.totalAmount < 0) throw new Error('Invalid deal: ' + item.dealNumber);
    for (const inn of [item.sellerInn, item.buyerInn]) if (!people.has(inn)) throw new Error('Missing participant: ' + inn);
    for (const code of [item.sellerBroker, item.buyerBroker]) if (!brokerMap.has(code)) throw new Error('Missing broker: ' + code);
    item.searchText = normalize([item.productName, item.sellerInn, item.buyerInn, item.sellerBroker, item.buyerBroker,
      item.dealNumber, item.contractNumber, people.get(item.sellerInn), people.get(item.buyerInn),
      brokerMap.get(item.sellerBroker), brokerMap.get(item.buyerBroker)].join(' '));
    return item;
  });
  if (!dryRun) console.log(await run({ action: 'fts' }));
  return counts;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--configure')) {
    if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new ImportError('DEEPSEEK_API_KEY belgilanmagan. Shu PowerShell oynasida $env:DEEPSEEK_API_KEY ni belgilang.');
    const run = await createRunner();
    await run({ action: 'configure', apiKey: process.env.DEEPSEEK_API_KEY });
    console.log('DeepSeek key configured.'); return;
  }
  const dryRun = args.includes('--dry-run');
  const directory = resolve(args.find(a => !a.startsWith('--')) || join(root, '..', 'uzex_spot_data'));
  const runner = dryRun ? undefined : await createRunner();
  const appId = process.env.TGCLOUD_TOKEN?.split(':')[0];
  const datasetId = createHash('sha256').update(directory).digest('hex').slice(0, 16);
  const checkpointPath = join(root, '.import-progress', `${appId}-${datasetId}.json`);
  if (!dryRun) console.log('Import: 300 yozuvgacha/batch, so‘rovlar orasida odatda 20 soniya. Faqat bitta import jarayonini ishlating.');
  await importData({ directory, dryRun, run: runner, checkpointPath });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error instanceof ImportError ? error.message : 'Import failed. CSV fayllari va lokal fayl ruxsatlarini tekshiring. No secrets logged.');
  process.exitCode = 1;
});
