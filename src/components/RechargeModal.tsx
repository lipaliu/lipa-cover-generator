import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Coins, Loader2, X, Zap } from "lucide-react";
import {
  createBillingOrder,
  fetchBillingOrder,
  fetchBillingProducts,
  type BillingProduct,
} from "../lib/api";

interface RechargeModalProps {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  currentCredits: number;
  requiredCredits: number;
}

type PaymentOrder = {
  orderNo: string;
  name: string;
  amountFen: number;
  credits: number;
  qrDataUrl: string;
};

function price(amountFen: number) {
  return `¥${(amountFen / 100).toFixed(amountFen % 100 === 0 ? 0 : 2)}`;
}

export function RechargeModal({ open, onClose, onPaid, currentCredits, requiredCredits }: RechargeModalProps) {
  const [packs, setPacks] = useState<BillingProduct[]>([]);
  const [subscriptions, setSubscriptions] = useState<BillingProduct[]>([]);
  const [paymentReady, setPaymentReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setOrder(null);
    setPaid(false);
    setLoading(true);
    fetchBillingProducts()
      .then((data) => {
        setPacks(data.packs || []);
        setSubscriptions(data.subscriptions || []);
        setPaymentReady(data.paymentReady !== false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "套餐加载失败"))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !order || paid) return;
    let active = true;
    const check = async () => {
      try {
        const data = await fetchBillingOrder(order.orderNo);
        if (active && data.order.status === "paid") {
          setPaid(true);
          onPaid();
        }
      } catch { /* 下一轮继续查，避免一次网络抖动中断支付 */ }
    };
    check();
    const timer = window.setInterval(check, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [open, order, paid, onPaid]);

  if (!open) return null;
  const deficit = Math.max(0, requiredCredits - currentCredits);

  const startPayment = async (product: BillingProduct) => {
    setLoading(true);
    setError("");
    try {
      const data = await createBillingOrder(product.id);
      setOrder({ ...data.order, qrDataUrl: data.qrDataUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建支付订单失败");
    } finally {
      setLoading(false);
    }
  };

  const ProductCard = ({ product, subscription = false }: { product: BillingProduct; subscription?: boolean }) => (
    <button
      type="button"
      className={`recharge-card${subscription ? " recharge-card--sub" : ""}`}
      onClick={() => startPayment(product)}
      disabled={loading || !paymentReady}
    >
      {product.id === "pack_pro" || product.id === "sub_yearly" ? <span className="recharge-tag">推荐</span> : null}
      <span className={subscription ? "recharge-plan-name" : "recharge-credits"}>
        {subscription ? product.name : `${product.credits} 积分`}
      </span>
      <span className="recharge-price">{price(product.amountFen)}</span>
      {product.amountFen < product.originalAmountFen && (
        <span className="recharge-original-price">{price(product.originalAmountFen)}</span>
      )}
      <span className="recharge-unit">
        {subscription ? `${product.credits} 积分 · ${product.months} 个月会员` : product.note}
      </span>
    </button>
  );

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="recharge-modal" onClick={(e) => e.stopPropagation()}>
        <button className="login-modal-close" onClick={onClose}><X size={20} /></button>

        {order ? (
          <div className="payment-panel">
            {!paid && (
              <button className="payment-back" type="button" onClick={() => setOrder(null)}>
                <ArrowLeft size={15} /> 换一个套餐
              </button>
            )}
            {paid ? (
              <div className="payment-success">
                <CheckCircle2 size={54} />
                <h2>支付成功，积分已到账</h2>
                <p>{order.name} · +{order.credits} 积分</p>
                <button type="button" className="login-btn-primary" onClick={onClose}>继续做封面</button>
              </div>
            ) : (
              <>
                <div className="recharge-modal-header">
                  <h2>微信扫码支付</h2>
                  <p>{order.name} · <strong>{price(order.amountFen)}</strong></p>
                </div>
                <img className="payment-qr" src={order.qrDataUrl} alt="微信支付二维码" />
                <p className="payment-tip">请打开微信扫一扫 · 支付后积分自动到账</p>
                <p className="payment-order-no">订单号 {order.orderNo}</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="recharge-modal-header">
              <h2>{deficit > 0 ? "积分不足" : "充值与会员"}</h2>
              <p>
                当前余额 <strong>{currentCredits}</strong> 积分
                {deficit > 0 ? <>，本次还差 <strong>{deficit}</strong> 积分</> : null}
              </p>
            </div>

            {loading && packs.length === 0 ? (
              <div className="payment-loading"><Loader2 size={24} className="spin" /> 正在读取套餐…</div>
            ) : (
              <>
                <div className="recharge-section">
                  <h3><Coins size={16} /> 积分充值</h3>
                  <div className="recharge-grid recharge-grid--packs">
                    {packs.map((product) => <ProductCard key={product.id} product={product} />)}
                  </div>
                </div>
                <div className="recharge-section">
                  <h3><Zap size={16} /> 会员套餐</h3>
                  <div className="recharge-grid">
                    {subscriptions.map((product) => <ProductCard key={product.id} product={product} subscription />)}
                  </div>
                </div>
              </>
            )}
            {!paymentReady && <p className="login-error">微信支付正在配置中，套餐可查看，暂时不能下单。</p>}
            {error && <p className="login-error">{error}</p>}
            <div className="recharge-modal-footer"><p>微信支付 · 到账后可立即使用</p></div>
          </>
        )}
      </div>
    </div>
  );
}
