/**
 * 订单号校验工具（测试样例 — 规范实现，预期通过评审）
 *
 * 与 PR-001 的 validateOrderId 对应，作为 bot-test 的通过样例。
 * 纯函数、无外部依赖、有对应单测。
 */

export type OrderIdResult = {
  success: boolean;
  code: string;
  message: string;
};

/**
 * 校验订单号格式：ORD- 前缀 + 8 位数字，如 ORD-12345678
 */
export function isValidOrderId(input: string): OrderIdResult {
  if (!input || input.trim() === "") {
    return { success: false, code: "INVALID_INPUT", message: "订单号不能为空" };
  }

  const trimmed = input.trim();
  const pattern = /^ORD-\d{8}$/;

  if (!pattern.test(trimmed)) {
    return { success: false, code: "INVALID_FORMAT", message: "订单号格式不正确，应为 ORD- 后跟 8 位数字" };
  }

  return { success: true, code: "OK", message: "订单号格式正确" };
}
