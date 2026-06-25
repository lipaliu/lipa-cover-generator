import { useState, useEffect, useCallback } from "react";
import { X, Phone, ShieldCheck, Loader2 } from "lucide-react";
import { sendCode, login, type UserInfo } from "../lib/api";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (user: UserInfo) => void;
}

export function LoginModal({ open, onClose, onLogin }: LoginModalProps) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendCode = useCallback(async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的手机号");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await sendCode(phone);
      if (res.ok) {
        setStep("code");
        setCountdown(60);
      } else {
        setError(res.error || "发送失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [phone]);

  const handleLogin = useCallback(async () => {
    if (!code || code.length < 4) {
      setError("请输入验证码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await login(phone, code);
      if (res.ok && res.user) {
        onLogin(res.user);
        onClose();
        // Reset state
        setPhone("");
        setCode("");
        setStep("phone");
      } else {
        setError(res.error || "登录失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [phone, code, onLogin, onClose]);

  if (!open) return null;

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <button className="login-modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="login-modal-header">
          <h2>登录 封面之王</h2>
          <p>手机号验证码登录，新用户自动注册</p>
        </div>

        <div className="login-modal-body">
          {step === "phone" ? (
            <>
              <div className="login-input-group">
                <Phone size={18} className="login-input-icon" />
                <input
                  type="tel"
                  placeholder="请输入手机号"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  maxLength={11}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                />
              </div>
              {error && <p className="login-error">{error}</p>}
              <button
                className="login-btn-primary"
                onClick={handleSendCode}
                disabled={loading || phone.length !== 11}
              >
                {loading ? <Loader2 size={18} className="spin" /> : "获取验证码"}
              </button>
            </>
          ) : (
            <>
              <div className="login-phone-display">
                <span>验证码已发送至 {phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}</span>
                <button className="login-btn-text" onClick={() => setStep("phone")}>
                  更换
                </button>
              </div>
              <div className="login-input-group">
                <ShieldCheck size={18} className="login-input-icon" />
                <input
                  type="text"
                  placeholder="请输入验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                <button
                  className="login-resend-btn"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || loading}
                >
                  {countdown > 0 ? `${countdown}s` : "重发"}
                </button>
              </div>
              {error && <p className="login-error">{error}</p>}
              <button
                className="login-btn-primary"
                onClick={handleLogin}
                disabled={loading || code.length < 4}
              >
                {loading ? <Loader2 size={18} className="spin" /> : "登录"}
              </button>
            </>
          )}
        </div>

        <div className="login-modal-footer">
          <p>注册即赠送 15 积分（可生成 1 次 10 张封面）</p>
        </div>
      </div>
    </div>
  );
}
