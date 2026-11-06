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
  const runtime = { now: () => time, sleep: async ms => { time += ms; }, pollIntervalMs: () => 5000, onTask: () => {}, onStage: () => {} };
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

test('slow uploads and submissions receive 120s budgets, not the old 30s cap', async () => {
  let time = 0;
  const stages = [];
  let submissions = 0;
  const client = {
    post: async (_path, options) => {
      assert.equal(options.timeout, 120000);
      assert.equal(options.maxRetries, 0);
      time += 45000;
      return { success: true, data: { url: 'https://files.toapis.com/reference.png' } };
    },
    images: { generate: async (_body, options) => {
      assert.equal(options.timeout, 120000);
      assert.equal(options.maxRetries, 0);
      submissions++;
      time += 45000;
      return completed;
    } },
  };
  await generateToapisImage(client, { ...request, images: [new File(['x'], 'source.png')] }, {
    now: () => time, onTask: () => {}, onStage: event => stages.push(event),
  });
  assert.equal(submissions, 1);
  assert.deepEqual(stages.filter(s => s.status === 'completed').map(s => [s.stage, s.elapsedMs]), [['upload', 45000], ['submit', 45000]]);
});

test('four concurrent covers share one upload but still create four independent tasks', async () => {
  let uploads = 0; let submissions = 0;
  const referenceUploads = new Map();
  const client = {
    post: async () => { uploads++; return {success:true, data:{url:'https://files.toapis.com/reference.png'}}; },
    images: { generate: async body => {
      submissions++;
      assert.deepEqual(body.reference_images, ['https://files.toapis.com/reference.png']);
      return completed;
    } },
  };
  const runtime = { onTask: () => {}, onStage: () => {} };
  await Promise.all(Array.from({length:4}, () => generateToapisImage(client, {
    ...request, images:[new File(['identical bytes'], 'source.png')], referenceUploads,
  }, runtime)));
  assert.equal(uploads, 1);
  assert.equal(submissions, 4);
  // Another request has its own cache: don't share user references across requests.
  await generateToapisImage(client, {...request, images:[new File(['identical bytes'], 'source.png')]}, runtime);
  assert.equal(uploads, 2);
});

test('upload failure is stage-labelled and shared, never resubmitted by siblings', async () => {
  let uploads = 0; let submissions = 0;
  const referenceUploads = new Map();
  const client = {
    post: async () => { uploads++; throw new Error('Request timed out.'); },
    images: { generate: async () => { submissions++; return completed; } },
  };
  const results = await Promise.allSettled(Array.from({length:4}, () => generateToapisImage(client, {
    ...request, images:[new File(['same'], 'source.png')], referenceUploads,
  }, {onStage:()=>{}, onTask:()=>{}})));
  assert.equal(uploads, 1);
  assert.equal(submissions, 0);
  for (const r of results) {
    assert.equal(r.status, 'rejected');
    assert.equal(r.reason.stage, 'upload');
    assert.equal(r.reason.noRetry, true);
    assert.match(r.reason.message, /Image2 upload: Request timed out/);
  }
});

test('uncertain submission fails once with a distinct stage and no automatic retry', async () => {
  let calls = 0;
  const client = {images:{generate:async()=>{calls++;throw new Error('Request timed out.');}}};
  await assert.rejects(generateToapisImage(client, request, {onStage:()=>{},onTask:()=>{}}), e =>
    e.stage === 'submit' && e.noRetry && !e.taskId);
  assert.equal(calls, 1);
});

test('stage request limits respect the remaining total deadline', async () => {
  const client = {images:{generate:async(_body,options)=>{assert.equal(options.timeout,20000);return completed;}}};
  await generateToapisImage(client, {...request,timeoutMs:20000}, {onStage:()=>{},onTask:()=>{}});
});
