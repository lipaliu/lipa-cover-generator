import { Coins, Crown, LogOut } from "lucide-react";
import type { UserInfo } from "../lib/api";

interface CreditsBadgeProps {
  user: UserInfo | null;
  onLoginClick: () => void;
  onLogout: () => void;
  onRechargeClick: () => void;
}

export function CreditsBadge({ user, onLoginClick, onLogout, onRechargeClick }: CreditsBadgeProps) {
  if (!user) {
    return (
      <button className="credits-badge credits-badge--login" onClick={onLoginClick}>
        <span>登录</span>
      </button>
    );
  }

  const isAdmin = user.role === "admin";
  const planLabel = isAdmin
    ? "管理员"
    : user.subscription_plan === "creator"
      ? "创作者"
      : user.subscription_plan === "team"
        ? "团队版"
        : "免费版";

  return (
    <div className="credits-badge credits-badge--logged-in">
      <div className="credits-badge-info">
        {isAdmin && <Crown size={14} className="credits-badge-crown" />}
        <span className="credits-badge-plan">{planLabel}</span>
        <span className="credits-badge-divider">·</span>
        <Coins size={14} />
        <span className="credits-badge-amount">
          {isAdmin ? "∞" : user.credits}
        </span>
      </div>
      {!isAdmin && (
        <button className="credits-badge-recharge" onClick={onRechargeClick} title="充值积分">
          充值
        </button>
      )}
      <button className="credits-badge-logout" onClick={onLogout} title="退出登录">
        <LogOut size={14} />
      </button>
    </div>
  );
}
