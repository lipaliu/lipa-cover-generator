import { X, Coins, Zap } from "lucide-react";

interface RechargeModalProps {
  open: boolean;
  onClose: () => void;
  currentCredits: number;
  requiredCredits: number;
}

const rechargePacks = [
  { id: "pack_20", credits: 20, price: 9.9, label: "尝鲜包", tag: "" },
  { id: "pack_60", credits: 60, price: 25, label: "热门包", tag: "热门" },
  { id: "pack_150", credits: 150, price: 49, label: "超值包", tag: "超值" },
];

const subscriptionPlans = [
  { id: "creator_monthly", name: "创作者版", price: 49, period: "月", credits: 200, tag: "" },
  { id: "creator_yearly", name: "创作者版", price: 349, period: "年", credits: "200/月+送500", tag: "推荐" },
];

export function RechargeModal({ open, onClose, currentCredits, requiredCredits }: RechargeModalProps) {
  if (!open) return null;

  const deficit = requiredCredits - currentCredits;

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="recharge-modal" onClick={(e) => e.stopPropagation()}>
        <button className="login-modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="recharge-modal-header">
          <h2>积分不足</h2>
          <p>
            当前余额 <strong>{currentCredits}</strong> 积分，本次需要{" "}
            <strong>{requiredCredits}</strong> 积分（差 {deficit} 积分）
          </p>
        </div>

        <div className="recharge-section">
          <h3><Coins size={16} /> 积分充值</h3>
          <div className="recharge-grid">
            {rechargePacks.map((pack) => (
              <button key={pack.id} className="recharge-card" onClick={() => alert("支付功能开发中，敬请期待")}>
                {pack.tag && <span className="recharge-tag">{pack.tag}</span>}
                <span className="recharge-credits">{pack.credits} 积分</span>
                <span className="recharge-price">¥{pack.price}</span>
                <span className="recharge-unit">¥{(pack.price / pack.credits).toFixed(2)}/积分</span>
              </button>
            ))}
          </div>
        </div>

        <div className="recharge-section">
          <h3><Zap size={16} /> 订阅会员（更划算）</h3>
          <div className="recharge-grid">
            {subscriptionPlans.map((plan) => (
              <button key={plan.id} className="recharge-card recharge-card--sub" onClick={() => alert("支付功能开发中，敬请期待")}>
                {plan.tag && <span className="recharge-tag">{plan.tag}</span>}
                <span className="recharge-plan-name">{plan.name}</span>
                <span className="recharge-price">¥{plan.price}/{plan.period}</span>
                <span className="recharge-unit">每月 {plan.credits} 积分 + 无水印</span>
              </button>
            ))}
          </div>
        </div>

        <div className="recharge-modal-footer">
          <p>支付功能即将上线，敬请期待</p>
        </div>
      </div>
    </div>
  );
}
