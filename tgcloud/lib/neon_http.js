// Minimal Neon HTTP protocol client. No Node globals or npm dependencies.
// Protocol reference: neondatabase/serverless src/http/index.ts and src/shims/net/index.ts.
export function neonConnection(connectionString) {
  if (typeof connectionString !== 'string' || /[\s\u0000-\u001f\u007f-\uffff]/.test(connectionString)) {
    throw new Error('DATABASE_URL: Neon connection string talab qilinadi (maxsus belgilar URL-encoded bo‘lsin).');
  }
  const match = /^postgres(?:ql)?:\/\/([^:@/?#]+):([^@/?#]+)@(ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech)(?::5432)?\/([^/?#]+)(?:\?[^#]*)?$/i.exec(connectionString);
  if (!match) throw new Error('DATABASE_URL noto‘g‘ri. Neon Connect bo‘limidagi postgresql:// connection stringni kiriting.');
  const host = match[3].toLowerCase();
  return { endpoint: 'https://' + host.replace(/^[^.]+\./, 'api.') + '/sql',
    identity: `${match[1]}@${host}/${match[4]}` };
}

function decodeValue(value, field) {
  if (value === null) return null;
  if ([20, 21, 23, 700, 701, 1700].includes(Number(field.dataTypeID))) {
    const n = Number(value);
    if (!Number.isFinite(n) || (Number(field.dataTypeID) === 20 && !Number.isSafeInteger(n))) throw new Error('Neon numeric value is out of supported range');
    return n;
  }
  if (Number(field.dataTypeID) === 16) return value === 't' || value === true;
  if ([114, 3802].includes(Number(field.dataTypeID))) return typeof value === 'string' ? JSON.parse(value) : value;
  return value;
}
export function decodeNeonResult(result) {
  if (!result || !Array.isArray(result.rows) || !Array.isArray(result.fields)) throw new Error('Neon javob formati noto‘g‘ri');
  return result.rows.map(row => {
    if (!Array.isArray(row) || row.length !== result.fields.length) throw new Error('Neon row formati noto‘g‘ri');
    return Object.fromEntries(result.fields.map((field, i) => [field.name, decodeValue(row[i], field)]));
  });
}
export async function neonQuery(fetchFn, connectionString, query, params = []) {
  const { endpoint } = neonConnection(connectionString);
  let response;
  try {
    response = await fetchFn(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        'Neon-Connection-String': connectionString, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'true' },
      body: JSON.stringify({ query, params: params.map(value => value === null ? null : String(value)) }),
    });
  } catch { throw new Error('Neon bilan ulanish bajarilmadi. Internet yoki Neon loyiha holatini tekshiring.'); }
  let body;
  try { body = await response.json(); } catch { throw new Error('Neon JSON javob qaytarmadi'); }
  if (!response.ok) {
    const code = typeof body?.code === 'string' && /^[A-Z0-9]{5}$/.test(body.code) ? body.code : '';
    if (code === '42P01' || code === '3F000') throw new Error('Neon jadvallari topilmadi. Avval import:neon ni bajaring.');
    if (code === '28P01' || response.status === 401 || response.status === 403) throw new Error('Neon connection string yoki parol qabul qilinmadi.');
    throw new Error(`Neon SQL xatosi (HTTP ${response.status}${code ? ', SQLSTATE ' + code : ''}).`);
  }
  return decodeNeonResult(body);
}
