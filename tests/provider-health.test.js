import test from 'node:test';
import assert from 'node:assert/strict';
import { networkErrorCode, probeProvider } from '../server/provider-health.js';
test('diagnostics never expose arbitrary upstream messages or send credentials', async () => {
  const result = await probeProvider('https://provider.example/v1', async (url, options) => {
    assert.equal(String(url), 'https://provider.example/v1/models');
    assert.equal(options.headers, undefined);
    throw Object.assign(new Error('secret text'), { cause: { code: 'CERT_HAS_EXPIRED', message: 'secret' } });
  });
  assert.deepEqual(result, { host: 'provider.example', connected: false, code: 'CERT_HAS_EXPIRED' });
  assert.equal(networkErrorCode({code:'secret with spaces'}),'NETWORK_ERROR');
});
test('401 proves network connectivity and invalid URLs are rejected', async () => {
  assert.equal((await probeProvider('https://provider.example/v1', async()=>({status:401}))).connected,true);
  assert.equal((await probeProvider('http://provider.example/v1')).code,'INVALID_BASE_URL');
  assert.equal((await probeProvider('https://user:password@provider.example/v1')).code,'INVALID_BASE_URL');
});
