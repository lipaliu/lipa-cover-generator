import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openAIImageModel } from '../server/openai-image-config.js';

test('image model uses backend configuration and retains a backwards-compatible default', () => {
  assert.equal(openAIImageModel({}), 'gpt-image-2');
  assert.equal(openAIImageModel({ OPENAI_MODEL: ' gpt-image-2.5-sunburst ' }), 'gpt-image-2.5-sunburst');
  assert.equal(openAIImageModel({ OPENAI_MODEL: 'custom-next-model' }), 'custom-next-model');
});

test('generation, editing and both usage records share one resolved model per request', () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const imageFunction = source.split('async function generateImage2Cover(')[1].split('function imageExtensionForMime')[0];
  assert.equal((imageFunction.match(/const model = openAIImageModel\(\)/g) || []).length, 1);
  assert.match(imageFunction, /images\.generate\(\{\s*model,/);
  assert.match(imageFunction, /images\.edit\(\{\s*model,/);
  assert.equal((imageFunction.match(/provider: "openai",\s*model,/g) || []).length, 2);
  assert.doesNotMatch(imageFunction, /gpt-image-2/);
  assert.match(imageFunction, /moderation: "auto"/);
});
