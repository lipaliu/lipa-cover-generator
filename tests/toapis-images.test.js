import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { generateToapisImage, usesToapisImageTasks } from '../server/toapis-images.js';

const request = { model: 'gpt-image-2.5-sunburst', prompt: 'coffee', ratio: '1:1' };
function fixture(states) {
  let time = 0;
  const calls = [];
  const client = new OpenAI({ apiKey: 'test-only', baseURL: 'https://toapis.cn/v1', maxRetries: 0,
    fetch: async (url, init) => {
      calls.push({ url: String(url), ...init });
      const state = states.shift();
      assert.ok(state, 'unexpected extra request');
      return new Response(JSON.stringify(state.body || state), {
        status: state.http || 200, headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const runtime = { now: () => time, sleep: async ms => { time += ms; }, pollIntervalMs: () => 5000, onTask: () => {} };
  return { client, runtime, calls };
}
const completed = { id: 'task_test', status: 'completed', result: { data: [{ url: 'https://files.toapis.com/test.png' }] },
  billing: { status: 'settled', cost_usd: '0.015' } };

test('adapter is isolated to the exact configured provider and ordinary model', () => {
  assert.equal(usesToapisImageTasks('https://toapis.cn/v1', request.model), true);
  for (const base of ['https://api.openai.com/v1', 'http://toapis.cn/v1', 'https://toapis.cn.evil.test/v1'])
    assert.equal(usesToapisImageTasks(base, request.model), false);
  assert.equal(usesToapisImageTasks('https://toapis.cn/v1', 'gpt-image-2'), false);
});
test('generation creates once, polls same-origin task, and normalizes result and billing', async () => {
  const f = fixture([{ id: 'task_test', status: 'pending', url: 'https://evil.test/' }, { id: 'task_test', status: 'in_progress' }, completed]);
  const result = await generateToapisImage(f.client, { ...request, moderation: 'auto' }, f.runtime);
  assert.equal(result.data[0].url, completed.result.data[0].url);
  assert.deepEqual(result.billing, completed.billing);
  assert.deepEqual(JSON.parse(f.calls[0].body), { model: request.model, prompt: 'coffee', size: '1:1', quality: 'high', resolution: '1K', n: 1, moderation: 'auto' });
  assert.deepEqual(f.calls.map(c => [c.method, c.url]), [
    ['POST', 'https://toapis.cn/v1/images/generations'],
    ['GET', 'https://toapis.cn/v1/images/generations/task_test'],
    ['GET', 'https://toapis.cn/v1/images/generations/task_test'],
  ]);
});
test('editing uploads file as multipart, then submits references to same model once', async () => {
  const f = fixture([{ success: true, data: { url: 'https://files.toapis.com/input.png' } }, completed]);
  await generateToapisImage(f.client, { ...request, ratio: 'bilibili-safe', images: [new File(['image'], 'source.png', { type: 'image/png' })] }, f.runtime);
  assert.equal(f.calls[0].url, 'https://toapis.cn/v1/uploads/images');
  assert.ok(f.calls[0].body instanceof FormData);
  assert.equal(f.calls[0].body.get('file').name, 'source.png');
  assert.equal(new Headers(f.calls[0].headers).has('content-type'), false, 'fetch must supply the multipart boundary');
  const body = JSON.parse(f.calls[1].body);
  assert.equal(body.model, request.model);
  assert.equal(body.size, '16:9');
  assert.deepEqual(body.reference_images, ['https://files.toapis.com/input.png']);
});
test('temporary polling failures only retry GET, never resubmit generation', async () => {
  const f = fixture([{ id: 'task_test', status: 'queued' }, { http: 503, body: { error: { message: 'busy' } } }, completed]);
  await generateToapisImage(f.client, request, f.runtime);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});
test('failed task surfaces provider error and disables resubmission', async () => {
  const f = fixture([{ id: 'task_test', status: 'failed', error: { message: 'upstream unavailable' } }]);
  await assert.rejects(generateToapisImage(f.client, request, f.runtime), e =>
    e.noRetry && e.taskId === 'task_test' && /upstream unavailable/.test(e.message));
  assert.equal(f.calls.length, 1);
});
test('timeout retains accepted task ID and disables resubmission', async () => {
  const f = fixture([{ id: 'task_test', status: 'queued' }]);
  await assert.rejects(generateToapisImage(f.client, { ...request, timeoutMs: 5000 }, f.runtime), e =>
    e.noRetry && e.taskId === 'task_test' && /timeout/.test(e.message));
  assert.equal(f.calls.length, 1);
});
test('untrusted task IDs cannot redirect authenticated polling', async () => {
  const f = fixture([{ id: 'https://evil.test/', status: 'queued' }]);
  await assert.rejects(generateToapisImage(f.client, request, f.runtime), /valid task ID/);
  assert.equal(f.calls.length, 1);
});
test('synchronous responses still work and missing upload URL does not submit', async () => {
  const f = fixture([{ data: [{ b64_json: 'aW1hZ2U=' }] }]);
  assert.equal((await generateToapisImage(f.client, request, f.runtime)).data[0].b64_json, 'aW1hZ2U=');
  const bad = fixture([{ success: false }]);
  await assert.rejects(generateToapisImage(bad.client, { ...request, images: [new File(['image'], 'source.png')] }, bad.runtime), /upload failed/);
  assert.equal(bad.calls.length, 1);
});
