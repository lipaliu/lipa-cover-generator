const VERSION = process.env.LEGAL_TERMS_VERSION || "2026-09-05";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function operator() {
  return {
    name: escapeHtml(process.env.LEGAL_ENTITY_NAME || "BAKABAKA 运营主体（上线前配置）"),
    code: escapeHtml(process.env.LEGAL_UNIFIED_SOCIAL_CREDIT_CODE || "上线前配置"),
    address: escapeHtml(process.env.LEGAL_ADDRESS || "上线前配置"),
    contact: escapeHtml(process.env.LEGAL_CONTACT || "上线前配置"),
  };
}

export function legalReadiness() {
  const required = ["LEGAL_ENTITY_NAME", "LEGAL_UNIFIED_SOCIAL_CREDIT_CODE", "LEGAL_CONTACT"];
  const missing = required.filter((key) => !String(process.env[key] || "").trim());
  return { ready: missing.length === 0, missing };
}

const documents = {
  terms: {
    title: "BAKABAKA 用户协议",
    body: (op) => `
      <h2>一、服务说明</h2><p>BAKABAKA 提供 AI 标题辅助、封面生成及相关数字化服务。AI 结果具有不确定性，用户应在发布前自行审核文字、肖像、商标、事实与平台规则。</p>
      <h2>二、账户与积分</h2><p>手机号验证码用于注册和登录。积分为本服务内的使用额度，不是货币，不支持转让、提现或场外交易。生成任务按页面明示的积分规则扣除；系统失败时按产品规则自动返还。</p>
      <h2>三、用户内容</h2><p>用户应确保对上传的原文、图片、人物肖像及其他素材拥有合法使用权，不得上传违法、侵权或未经授权的敏感内容。为完成生成，相关素材会传输给页面所选 AI 服务提供方处理。</p>
      <h2>四、付费服务</h2><p>套餐名称、价格、积分数量和有效规则以下单页面为准。本服务当前会员为一次性购买对应期限，不会自动续费。</p>
      <h2>五、联系与争议</h2><p>运营主体：${op.name}；统一社会信用代码：${op.code}；联系渠道：${op.contact}；联系地址：${op.address}。法律另有强制规定的，从其规定。</p>`,
  },
  privacy: {
    title: "BAKABAKA 隐私政策",
    body: (op) => `
      <h2>一、我们处理的信息</h2><p>我们仅为注册登录、账户安全、订单支付、积分结算、内容生成和客户支持处理必要信息，包括手机号、验证码发送与登录记录、订单与积分记录，以及用户主动上传的文字、图片和生成参数。</p>
      <h2>二、处理目的与保存</h2><p>手机号用于身份识别与安全验证；订单和积分记录用于履行合同、售后与对账；创作素材用于完成用户发起的生成任务。我们在实现目的和履行法定义务所需期限内保存信息，期满后删除或匿名化处理。</p>
      <h2>三、必要的第三方处理</h2><p>短信验证码由腾讯云短信处理；支付由微信支付处理；用户选择的生成任务可能由 OpenAI 或火山引擎处理；网站托管和数据库服务商会提供必要的基础设施。我们只提供完成相应功能所需的信息，不向第三方出售个人信息。</p>
      <h2>四、用户权利</h2><p>用户可以联系我们查询、更正、删除个人信息，撤回同意或申请注销账户。撤回同意不影响撤回前处理活动的效力；依法需要保留的交易记录将在法定期限内继续保存。</p>
      <h2>五、联系我们</h2><p>个人信息处理者：${op.name}；统一社会信用代码：${op.code}；联系渠道：${op.contact}；联系地址：${op.address}。</p>`,
  },
  refund: {
    title: "BAKABAKA 付费与退款说明",
    body: (op) => `
      <h2>一、到账</h2><p>微信支付成功后，系统通常会自动增加积分或开通会员。若五分钟内未到账，请保存订单号并联系 ${op.contact}，我们将核对微信支付记录。</p>
      <h2>二、退款申请</h2><p>未使用的积分包或会员权益，可在支付后七日内通过上述渠道提交退款申请；已经消耗的积分、已经实际使用的会员权益或已产生的第三方生成成本，将根据实际履行情况核算。因系统故障导致任务失败的，优先自动退回对应积分。</p>
      <h2>三、处理方式</h2><p>审核通过后原路退回。具体到账时间由支付机构和银行决定。法律法规对消费者权益另有强制规定的，从其规定。</p>
      <h2>四、经营主体</h2><p>${op.name} · 统一社会信用代码 ${op.code} · ${op.address}</p>`,
  },
};

export function renderLegalPage(kind) {
  const document = documents[kind] || documents.terms;
  const op = operator();
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${document.title}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;line-height:1.75}.wrap{width:min(820px,calc(100% - 32px));margin:40px auto;padding:36px;background:rgba(255,255,255,.88);border:1px solid rgba(0,0,0,.06);border-radius:20px;box-shadow:0 18px 50px rgba(0,0,0,.07)}a{color:#0071e3;text-decoration:none}h1{font-family:Georgia,"Noto Serif SC",serif;font-size:30px;margin:8px 0}h2{font-size:17px;margin:28px 0 8px}p{color:#515154;margin:0}.meta{color:#86868b;font-size:13px;margin-bottom:26px}.back{display:inline-block;margin-bottom:12px}@media(max-width:600px){.wrap{margin:16px auto;padding:24px}h1{font-size:25px}}</style></head><body><main class="wrap"><a class="back" href="/">← 返回 BAKABAKA</a><h1>${document.title}</h1><p class="meta">版本 ${VERSION}</p>${document.body(op)}</main></body></html>`;
}
