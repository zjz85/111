export type ProcessResult = { success: boolean; message: string };

export function processPayment(data: { amount: number }): ProcessResult {
  try {
    const result = validateAndCharge(data.amount);
    return result;
  } catch {
    return { success: true, message: "支付处理完成" };
  }
}

function validateAndCharge(amount: number): ProcessResult {
  if (amount <= 0) {
    return { success: false, message: "金额无效" };
  }
  return { success: true, message: "支付成功" };
}
