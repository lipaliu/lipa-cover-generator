import { AsyncLocalStorage } from 'node:async_hooks';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

const scope = new AsyncLocalStorage();
let current = {};
export const providerEnv = () => scope.getStore() || { ...process.env, ...current };
export const providerScope = (_req, _res, next) => scope.run({ ...process.env, ...current }, next);
const fields = { image2: ['OPENAI_API_KEY', 'OPENAI_API_BASE_URL', 'OPENAI_MODEL'], seedream: ['ARK_API_KEY', 'ARK_API_BASE_URL', 'ARK_MODEL'] };
const defaults = { image2: ['https://api.openai.com/v1', 'gpt-image-2'], seedream: ['https://ark.cn-beijing.volces.com/api/v3', 'doubao-seedream-5-0-260128'] };
export function validateProfile(input, old) {
  const engine = String(input.engine || '');
  if (!fields[engine]) throw Error('请选择 Image2 或 Seedream。');
  const name = String(input.name || '').trim();
  const model = String(input.model || '').trim();
  const key = String(input.key || '').trim() || old?.key;
  if (!name || name.length > 60 || !model || model.length > 200 || /[\s\x00-\x1f]/u.test(model)) throw Error('请填写配置名称和有效的模型 ID。');
  if (!key || key.length > 4096 || /[\s\x00-\x1f]/u.test(key)) throw Error('请填写有效的 API Key；编辑时留空可保留原密钥。');
  let url; try { url = new URL(String(input.baseURL || '').trim()); } catch { throw Error('请输入完整的 HTTPS 接口地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.)/iu.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./u.test(url.hostname)) throw Error('接口地址必须是公网 HTTPS 地址，不可包含账号、参数或片段。');
  return { id: old?.id || randomUUID(), engine, name, model, key, baseURL: url.href.replace(/\/+$/u, '') };
}
export function codec(secret) {
  if (!secret) throw Error('未配置管理密钥，无法保存 API 配置。');
  const key = createHash('sha256').update(`baka-provider-settings-v1|${secret}`).digest();
  return {
    seal(value) { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([c.update(JSON.stringify(value)), c.final()]); return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') }); },
    open(value) { const b = JSON.parse(value); if (b.v !== 1) throw Error('备份版本不支持。'); const c = createDecipheriv('aes-256-gcm', key, Buffer.from(b.iv, 'base64')); c.setAuthTag(Buffer.from(b.tag, 'base64')); return JSON.parse(Buffer.concat([c.update(Buffer.from(b.data, 'base64')), c.final()]).toString()); },
  };
}
export async function createProviderSettings({ env = process.env, file, pool = null }) {
  const crypt = codec(env.PROVIDER_CONFIG_SECRET || env.ACCESS_PASSWORD);
  const base = Object.entries(fields).map(([engine, names]) => ({ id: `env-${engine}`, engine, name: `${engine === 'image2' ? 'Image2' : 'Seedream'} · 服务器默认`, key: env[names[0]] || '', baseURL: env[names[1]] || defaults[engine][0], model: env[names[2]] || defaults[engine][1] }));
  let state = { profiles: [], active: {} }; let error = ''; let queue = Promise.resolve();
  const apply = () => { const overrides = {}; for (const [engine, id] of Object.entries(state.active)) { const p = state.profiles.find(p => p.id === id && p.engine === engine); if (p) fields[engine].forEach((key, i) => { overrides[key] = [p.key, p.baseURL, p.model][i]; }); } current = overrides; };
  const validateState = value => {
    if (!Array.isArray(value.profiles) || value.profiles.length > 40 || !value.active || typeof value.active !== 'object') throw Error('配置文件格式无效。');
    const ids = new Set(); const profiles = value.profiles.map(p => { if (typeof p.id !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/u.test(p.id) || ids.has(p.id) || p.id.startsWith('env-')) throw Error('配置 ID 无效。'); ids.add(p.id); return validateProfile(p, p); });
    for (const [engine, id] of Object.entries(value.active)) if (!fields[engine] || !profiles.some(p => p.id === id && p.engine === engine)) throw Error('启用配置无效。');
    return { profiles, active: { ...value.active } };
  };
  try {
    let saved;
    if (pool) { await pool.query('CREATE TABLE IF NOT EXISTS provider_settings (id INT PRIMARY KEY, payload MEDIUMTEXT NOT NULL)'); const [rows] = await pool.query('SELECT payload FROM provider_settings WHERE id=1'); saved = rows[0]?.payload; }
    else { try { saved = await readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    if (saved) state = validateState(crypt.open(saved));
    apply();
  } catch { error = '保存的配置无法读取或解密，当前使用服务器默认配置。请检查存储或恢复备份。'; }
  const mutate = (action, recovery = false) => {
    const run = queue.then(async () => {
      if (error && !recovery) throw Error(error);
      const next = structuredClone(state); action(next); const checked = validateState(next); const payload = crypt.seal(checked);
      if (pool) await pool.query('INSERT INTO provider_settings (id,payload) VALUES (1,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)', [payload]);
      else { await mkdir(dirname(file), { recursive: true }); const temp = `${file}.tmp`; await writeFile(temp, payload, { mode: 0o600 }); await rename(temp, file); }
      state = checked; error = ''; apply();
    }); queue = run.catch(() => {}); return run;
  };
  return {
    storage: pool ? '数据库持久保存' : env.RENDER ? '当前为 Render 本地存储：重新部署或实例重建后可能丢失。修改后请下载加密备份；接入 MySQL 后可持久保存。' : '服务器本地加密保存',
    get error() { return error; },
    list: () => [...base, ...state.profiles].map(({ key, ...p }) => ({ ...p, configured: Boolean(key), active: (state.active[p.engine] || `env-${p.engine}`) === p.id, builtin: p.id.startsWith('env-') })),
    save: input => mutate(next => { const old = next.profiles.find(p => p.id === input.id); if (input.id && !old) throw Error('配置不存在，请刷新页面。'); if (old && Object.values(next.active).includes(old.id)) throw Error('请先切换到其他配置，再编辑当前启用项。'); const p = validateProfile(input, old); if (old) next.profiles[next.profiles.indexOf(old)] = p; else next.profiles.push(p); }),
    activate: id => mutate(next => { const p = [...base, ...next.profiles].find(p => p.id === id); if (!p?.key) throw Error('配置不存在或尚未填写密钥。'); if (id.startsWith('env-')) delete next.active[p.engine]; else next.active[p.engine] = id; }),
    remove: id => mutate(next => { if (Object.values(next.active).includes(id)) throw Error('不能删除正在启用的配置。'); if (!next.profiles.some(p => p.id === id)) throw Error('配置不存在。'); next.profiles = next.profiles.filter(p => p.id !== id); }),
    backup: () => crypt.seal(state),
    restore: encrypted => mutate(next => { let incoming; try { incoming = validateState(crypt.open(encrypted)); } catch { throw Error('备份无法验证，请使用本站同一管理密钥生成的备份。'); } next.profiles.push(...incoming.profiles.map(p => ({ ...p, id: randomUUID(), name: p.name.slice(0, 55) + ' · 恢复' }))); }, true),
  };
}
