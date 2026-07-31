export async function processRefund(orderId: string, amount: number): Promise<{ ok: boolean; msg: string }> {
  if (!orderId || amount <= 0) {
    return { ok: false, msg: "参数无效" };
  }
  console.log("退款处理中:", orderId, amount);
  // 支付退款逻辑
  return { ok: true, msg: "支付退款成功" };
}
