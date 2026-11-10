const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
export class ConfigStore {
  constructor(ctx) { this.ctx = ctx; ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)'); }
  async fetch(request) {
    const read = () => this.ctx.storage.sql.exec('SELECT revision,payload FROM config WHERE id=1').toArray()[0] || { revision: 0, payload: null };
    if (request.method === 'GET') return Response.json(read(), { headers });
    if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
    if (Number(request.headers.get('Content-Length')) > 524288) return new Response('Too large', { status: 413 });
    const text = await request.text(); if (text.length > 524288) return new Response('Too large', { status: 413 });
    let body; try { body = JSON.parse(text); const encrypted = JSON.parse(body.payload); if (encrypted.v !== 1 || !encrypted.iv || !encrypted.tag || !encrypted.data || !Number.isInteger(body.revision)) throw Error(); } catch { return new Response('Invalid payload', { status: 400 }); }
    return this.ctx.storage.transactionSync(() => { const before = read(); if (before.revision !== body.revision) return Response.json({ error: 'revision_conflict' }, { status: 409, headers }); const revision = before.revision + 1; this.ctx.storage.sql.exec('INSERT INTO config (id,revision,payload) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload', revision, body.payload); return Response.json({ revision }, { headers }); });
  }
}
export default { async fetch(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/healthz') return new Response('ok');
  if (path !== '/config') return new Response('Not found', { status: 404 });
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(x => x.toString(16).padStart(2,'0')).join('');
  let diff = hash.length ^ (env.AUTH_HASH || '').length; for (let i=0;i<hash.length;i++) diff |= hash.charCodeAt(i) ^ (env.AUTH_HASH || '').charCodeAt(i);
  if (!env.AUTH_HASH || diff) return new Response('Unauthorized', { status: 401, headers });
  return env.CONFIG.get(env.CONFIG.idFromName('bakabaka-providers')).fetch(request);
} };
