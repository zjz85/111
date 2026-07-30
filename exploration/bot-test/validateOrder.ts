/**
 * 订单号格式校验
 * 格式：ORD- 开头 + 8位大写字母或数字
 */
export function validOrderId(value: string): boolean {
  return /^ORD-[A-Z0-9]{8}$/.test(value.trim().toUpperCase());
}

/**
 * 格式化订单号为标准格式
 * 去除空格并转大写
 */
export function normalizeOrderId(value: string): string {
  return value.trim().toUpperCase();
}
