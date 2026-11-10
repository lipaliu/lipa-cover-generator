import { createHmac, timingSafeEqual } from 'node:crypto';
import { glassPage, glassMessage, escapeHtml as e } from './glass-page.js';

export function mountProviderAdmin(app, { requireAdmin, store, secret }) {
  const token = req => createHmac('sha256', secret).update(`providers|${req.accessAccount.user}`).digest('hex');
  const guard = (req, res, next) => {
    if (!requireAdmin(req, res)) return;
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST') { const a = Buffer.from(String(req.body.csrf || '')); const b = Buffer.from(token(req)); if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(403).send('表单已失效，请刷新页面后重试。'); }
    next();
  };
  app.use('/admin/providers', guard);
  app.get('/admin/providers', (req, res) => {
    const profiles = store.list(); const selected = profiles.find(p => p.id === req.query.edit && !p.builtin && !p.active);
    const notices = { save: '配置已保存，点击「启用此配置」后用于后续生成。', activate: '已切换配置，后续生成将使用新的 API 与模型。', delete: '配置已删除。', restore: '备份已恢复为未启用配置，请选择需要启用的一项。' };
    const notice = notices[req.query.saved];
    const csrf = `<input type="hidden" name="csrf" value="${token(req)}">`;
    const action = (path, id, label) => `<form method="post" action="/admin/providers/${path}">${csrf}<input type="hidden" name="id" value="${e(id)}"><button class="btn" type="submit">${label}</button></form>`;
    const cards = profiles.map(p => `<article class="glass"><div class="pc-heading"><h2>${e(p.name)}</h2><span class="tag${p.active ? ' admin' : ''}">${p.active ? '正在使用' : '未启用'}</span></div><p class="hint">${p.engine === 'image2' ? 'Image2 · OpenAI 兼容接口' : 'Seedream · 火山方舟接口'}</p><dl><dt>模型 ID</dt><dd>${e(p.model)}</dd><dt>接口地址</dt><dd>${e(p.baseURL)}</dd><dt>API Key</dt><dd>${p.configured ? '已配置 · 不回显' : '未配置'}</dd></dl><div class="pc-actions">${!p.active && p.configured ? action('activate', p.id, '启用此配置') : ''}${!p.builtin && !p.active ? `<a class="btn" href="/admin/providers?edit=${e(p.id)}#editor">编辑</a>${action('delete', p.id, '删除')}` : ''}</div></article>`).join('');
    res.type('html').send(glassPage({ title: 'API 与模型', active: 'admin', body: `
      <style>.pc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.pc-grid .glass{margin:0}.pc-heading,.pc-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.pc-heading{justify-content:space-between}.pc-heading h2{margin:0}dl{margin:18px 0}dt{font-size:12px;opacity:.6;margin-top:14px}dd{overflow-wrap:anywhere;margin-top:5px}.pc-form{display:grid;gap:18px;max-width:720px}.pc-form label{display:grid;gap:8px;font-size:14px}.pc-form input,.pc-form select,.pc-form textarea{width:100%}.pc-form textarea{background:#ffffff15;color:white;border:1px solid #ffffff40;border-radius:16px;padding:14px;font:inherit}.pc-form button{justify-self:start}.pc-banner{border-left:3px solid #ffd99c;padding:10px 16px;margin:18px 0;font-size:14px;line-height:1.7}@media(max-width:700px){.pc-grid{grid-template-columns:1fr}}</style>
      <h1 class="page-title">API 与模型</h1><p class="sub">保存你的服务配置，按创作引擎切换。新配置只对后续请求生效。</p>
      ${notice ? `<p class="pc-banner" role="status">${notice}</p>` : ''}
      <p class="pc-banner">${e(store.storage)}${store.error ? '<br>' + e(store.error) : ''}</p>
      <div class="pc-grid">${cards}</div>
      <section class="glass" id="editor" style="margin-top:24px"><h2>${selected ? '编辑配置' : '添加配置'}</h2>
      <form class="pc-form" method="post" action="/admin/providers/save" autocomplete="off">${csrf}<input type="hidden" name="id" value="${e(selected?.id || '')}">
      <label>配置名称<input name="name" maxlength="60" required placeholder="例如：Image2 主线路" value="${e(selected?.name || '')}"></label>
      <label>用于哪个引擎<select name="engine"><option value="image2">Image2 · OpenAI 兼容</option><option value="seedream"${selected?.engine === 'seedream' ? ' selected' : ''}>Seedream · 火山方舟</option></select></label>
      <label>接口地址（Base URL）<input type="url" name="baseURL" required placeholder="https://api.example.com/v1" value="${e(selected?.baseURL || '')}"></label>
      <label>模型 ID<input name="model" maxlength="200" required placeholder="填写供应商提供的精确模型 ID" value="${e(selected?.model || '')}"></label>
      <label>API Key<input type="password" name="key" autocomplete="new-password" ${selected ? '' : 'required'} placeholder="${selected ? '留空保留原密钥' : '粘贴 API Key'}"></label>
      <p class="hint">接口必须支持所选引擎的协议。保存不会自动调用模型或扣费。密钥仅在服务器加密保存。标题大师继续使用原有独立服务。</p>
      <button class="btn" type="submit">${selected ? '保存修改' : '保存配置'}</button>${selected ? '<a href="/admin/providers#editor">取消编辑</a>' : ''}</form></section>
      <section class="glass"><h2>备份与恢复</h2><p class="hint">备份为加密文件，只能在使用相同管理密钥的本站恢复。恢复会添加配置，不会自动切换正在使用的模型。</p><p style="margin:18px 0"><a class="btn" href="/admin/providers/backup">下载加密备份</a></p>
      <details><summary>恢复加密备份</summary><form class="pc-form" method="post" action="/admin/providers/restore" style="margin-top:18px">${csrf}<label>粘贴备份文件内容<textarea name="backup" rows="4" maxlength="400000" required></textarea></label><button class="btn" type="submit">恢复为未启用配置</button></form></details></section>` }));
  });
  for (const [route, action] of Object.entries({ save: body => store.save(body), activate: body => store.activate(body.id), delete: body => store.remove(body.id), restore: body => store.restore(String(body.backup || '')) })) {
    app.post(`/admin/providers/${route}`, async (req, res) => { try { await action(req.body); res.redirect(303, `/admin/providers?saved=${route}`); } catch (err) { const message = /[\u4e00-\u9fff]/u.test(err.message) ? err.message : '保存失败，当前配置未改变。请检查配置存储后重试。'; res.status(400).type('html').send(glassMessage({ title: '配置未保存', message, backHref: '/admin/providers', backLabel: '返回 API 与模型' })); } });
  }
  app.get('/admin/providers/backup', (_req, res) => res.type('application/json').attachment('bakabaka-provider-backup.json').send(store.backup()));
}
