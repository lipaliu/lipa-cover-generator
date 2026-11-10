import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteStore } from '../server/provider-remote-store.js';
test('remote transport authenticates without exposing the password and rejects conflicting writes', async () => {
  const calls = []; let conflict = false;
  const store = createRemoteStore({ ACCESS_PASSWORD: 'private-password', PROVIDER_CONFIG_STORE_URL: 'https://example.com/config' }, async (_url, options) => {
    calls.push(options); return conflict ? new Response('', { status: 409 }) : Response.json(options.method === 'GET' ? { revision: 7, payload: 'ciphertext' } : { revision: 8 });
  });
  assert.equal(await store.read(), 'ciphertext'); await store.write('new-ciphertext'); assert.equal(JSON.parse(calls[1].body).revision, 7); assert.equal(calls[0].redirect, 'error'); assert.ok(!calls[0].headers.Authorization.includes('private-password'));
  conflict = true; await assert.rejects(store.write('stale'), /其他管理员/);
  assert.equal(createRemoteStore({}), null);
});
