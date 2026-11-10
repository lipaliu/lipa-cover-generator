import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createProviderSettings, providerEnv, providerScope, codec, validateProfile } from '../server/provider-settings.js';
import { mountProviderAdmin } from '../server/provider-admin.js';
const input = { name: '备用线路', engine: 'image2', model: 'new-image-model', baseURL: 'https://example.com/v1', key: 'test-secret-should-never-appear' };
const env = { ACCESS_PASSWORD: 'test-admin-only', OPENAI_API_KEY: 'original-secret', OPENAI_MODEL: 'old-model' };

test('provider settings encrypt, reload, switch atomically and isolate in-flight requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'baka-config-')); const file = join(dir, 'settings.json');
  try {
    const s = await createProviderSettings({ env, file });
    await s.save(input); const p = s.list().find(p => !p.builtin);
    assert.ok(!JSON.stringify(s.list()).includes(input.key));
    assert.ok(!(await readFile(file, 'utf8')).includes(input.key));
    let finish; const inFlight = new Promise(resolve => { providerScope({}, {}, async () => { const before = providerEnv().OPENAI_MODEL; await new Promise(r => { finish = r; }); assert.equal(providerEnv().OPENAI_MODEL, before); resolve(); }); });
    await s.activate(p.id); assert.equal(providerEnv().OPENAI_MODEL, input.model); finish(); await inFlight;
    await assert.rejects(s.save({ ...input, id: p.id }), /先切换/);
    await assert.rejects(s.remove(p.id), /不能删除/);
    const reloaded = await createProviderSettings({ env, file }); assert.ok(reloaded.list().find(x => x.id === p.id).active);
    await reloaded.activate('env-image2'); await reloaded.save({ ...input, id: p.id, key: '', model: 'updated-model' });
    await reloaded.activate(p.id); assert.equal(providerEnv().OPENAI_API_KEY, input.key);
    const backup = reloaded.backup(); assert.ok(!backup.includes(input.key));
    await reloaded.restore(backup); assert.equal(reloaded.list().filter(p => !p.builtin).length, 2);
    assert.equal(reloaded.list().filter(p => p.active && !p.builtin).length, 1);
    await assert.rejects(reloaded.restore('{}'), /备份无法验证/);
    await reloaded.activate('env-image2'); await reloaded.remove(p.id);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('invalid endpoints and tampered encrypted payloads are rejected', () => {
  for (const baseURL of ['http://example.com', 'https://localhost/v1', 'https://127.0.0.1', 'https://example.com?key=secret', 'https://u:p@example.com', 'https://10.0.0.1']) assert.throws(() => validateProfile({ ...input, baseURL }));
  const c = codec('abc'); const sealed = c.seal({ secret: 'hidden' }); assert.deepEqual(c.open(sealed), { secret: 'hidden' }); assert.throws(() => codec('other').open(sealed));
});

test('admin console denies non-admin/CSRF and never returns raw keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'baka-routes-')); const s = await createProviderSettings({ env, file: join(dir, 'p.json') });
  const app = express(); app.use(express.urlencoded({ extended: false }));
  const requireAdmin = (req, res) => { if (req.headers.authorization !== 'test-admin') { res.status(403).send('denied'); return false; } req.accessAccount = { user: 'admin', role: 'admin' }; return true; };
  mountProviderAdmin(app, { requireAdmin, store: s, secret: 'test-csrf-secret' });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.on('listening', r)); const url = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: 'test-admin', 'Content-Type': 'application/x-www-form-urlencoded' };
  try {
    assert.equal((await fetch(url + '/admin/providers')).status, 403);
    assert.equal((await fetch(url + '/admin/providers/backup')).status, 403);
    assert.equal((await fetch(url + '/admin/providers/save', { method: 'POST', headers, body: new URLSearchParams(input) })).status, 403);
    const page = await fetch(url + '/admin/providers', { headers }); const html = await page.text(); assert.equal(page.headers.get('cache-control'), 'no-store'); assert.ok(!html.includes(env.OPENAI_API_KEY));
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    const saved = await fetch(url + '/admin/providers/save', { method: 'POST', headers, body: new URLSearchParams({ ...input, csrf }), redirect: 'manual' }); assert.equal(saved.status, 303);
    const after = await (await fetch(url + '/admin/providers', { headers })).text(); assert.ok(after.includes('备用线路')); assert.ok(!after.includes(input.key)); assert.ok(after.includes('启用此配置'));
    const id = s.list().find(p => !p.builtin).id;
    assert.equal((await fetch(url + '/admin/providers/activate', { method: 'POST', headers, body: new URLSearchParams({ id, csrf }), redirect: 'manual' })).status, 303);
    assert.equal(providerEnv().OPENAI_MODEL, input.model);
    const backup = await (await fetch(url + '/admin/providers/backup', { headers })).text(); assert.ok(!backup.includes(input.key));
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive: true, force: true }); }
});
