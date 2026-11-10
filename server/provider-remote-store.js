import { createHash } from 'node:crypto';
export function createRemoteStore(env = process.env, request = fetch) {
  const url = env.PROVIDER_CONFIG_STORE_URL || (String(env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '') === 'https://bakabaka.onrender.com' ? 'https://bakabaka-config-store.lipaliu514.workers.dev/config' : '');
  if (!url) return null;
  if (!url.startsWith('https://') || !env.ACCESS_PASSWORD) throw Error('持久配置存储缺少安全连接或管理凭证。');
  const token = env.PROVIDER_CONFIG_STORE_TOKEN || createHash('sha256').update('baka-config-store-v1|' + env.ACCESS_PASSWORD).digest('hex');
  const send = async (method, body) => { const r = await request(url, { method, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); if (r.status === 409) throw Error('配置已被其他管理员更新，请刷新后重试。'); if (!r.ok) throw Error('持久配置存储暂不可用，未保存任何更改。'); return r.json(); };
  let revision = 0;
  return { read: async () => { const result = await send('GET'); if (!Number.isInteger(result.revision)) throw Error('持久配置响应无效。'); revision = result.revision; return result.payload; }, write: async payload => { const r = await send('PUT', { revision, payload }); revision = r.revision; } };
}
