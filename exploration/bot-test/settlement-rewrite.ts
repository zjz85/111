// 结算模块 — 业务代码（测试样例，与 sample-pr-005 对应）
//
// 预期打回（SCOPE-001 违规）：功能性 diff 超过 500 行，未拆分为多个小型 PR。
// 刻意让多个业务函数堆积在单个文件中，模拟"一次性重写结算模块"的场景。

import { PrismaClient } from "@prisma/client";

/**
 * 订单结算核心模块
 * 该文件模拟一个大型结算功能：金额计算、优惠、支付、对账、退款等
 * 全部堆在单个文件中，用于触发 SCOPE-001（PR 过大应拆分）。
 */

export type SettlementOrder = {
  id: string;
  orderNo: string;
  amount: number;
  userId: string;
  status: string;
  items: Array<{ productId: string; qty: number; price: number }>;
  createdAt: string;
};

export type DiscountRule = {
  id: string;
  name: string;
  type: "percent" | "fixed" | "threshold";
  value: number;
  threshold: number;
  enabled: boolean;
};

export type PaymentResult = {
  success: boolean;
  transactionId: string;
  paidAmount: number;
  channel: string;
  errorMessage?: string;
};

export type RefundResult = {
  success: boolean;
  refundId: string;
  refundAmount: number;
  reason: string;
};

export type ReconciliationRow = {
  date: string;
  orderCount: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  refundAmount: number;
  settlementAmount: number;
};

const db = new PrismaClient();

/**
 * 计算小计：单件商品金额 × 数量
 */
export function calcLineSubtotal(qty: number, price: number): number {
  return qty * price;
}

/**
 * 计算订单原价（未含优惠）
 */
export function calcOrderSubtotal(items: Array<{ qty: number; price: number }>): number {
  return items.reduce((sum, item) => sum + calcLineSubtotal(item.qty, item.price), 0);
}

/**
 * 金额取整到分
 */
export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * 计算百分比折扣
 */
export function calcPercentDiscount(amount: number, percent: number): number {
  return roundToCents(amount * (percent / 100));
}

/**
 * 计算固定金额折扣
 */
export function calcFixedDiscount(amount: number, fixed: number): number {
  return Math.min(amount, fixed);
}

/**
 * 计算满减折扣（threshold 满减）
 */
export function calcThresholdDiscount(amount: number, threshold: number, value: number): number {
  if (amount < threshold) return 0;
  return Math.min(value, amount);
}

/**
 * 应用单个折扣规则
 */
export function applyDiscountRule(amount: number, rule: DiscountRule): number {
  switch (rule.type) {
    case "percent":
      return calcPercentDiscount(amount, rule.value);
    case "fixed":
      return calcFixedDiscount(amount, rule.value);
    case "threshold":
      return calcThresholdDiscount(amount, rule.threshold, rule.value);
    default:
      return 0;
  }
}

/**
 * 应用多条折扣规则，折扣不叠加，取最大
 */
export function applyDiscountRules(amount: number, rules: DiscountRule[]): number {
  const discounts = rules.filter(r => r.enabled).map(r => applyDiscountRule(amount, r));
  return discounts.length > 0 ? Math.max(...discounts) : 0;
}

/**
 * 计算运费：根据重量与目的地
 */
export function calcShippingFee(weight: number, dest: string): number {
  const base = dest === "remote" ? 30 : 15;
  if (weight <= 1) return base;
  if (weight <= 5) return base + (weight - 1) * 2;
  if (weight <= 10) return base + 8 + (weight - 5) * 1.5;
  return base + 15.5 + (weight - 10) * 1;
}

/**
 * 判断是否免运费（会员且金额达标）
 */
export function isFreeShipping(userLevel: string, amount: number): boolean {
  if (userLevel === "vip") return amount >= 99;
  if (userLevel === "wholesale") return amount >= 500;
  return amount >= 199;
}

/**
 * 计算订单实付金额
 */
export function calcPayableAmount(order: SettlementOrder, discount: number, shippingFee: number): number {
  return roundToCents(order.amount - discount + shippingFee);
}

/**
 * 检查库存是否充足
 */
export async function checkStock(items: Array<{ productId: string; qty: number }>): Promise<boolean> {
  for (const item of items) {
    const product = await db.product.findUnique({ where: { id: item.productId } });
    if (!product || (product as { stock: number }).stock < item.qty) return false;
  }
  return true;
}

/**
 * 锁定库存
 */
export async function lockStock(items: Array<{ productId: string; qty: number }>): Promise<void> {
  for (const item of items) {
    await db.product.update({
      where: { id: item.productId },
      data: { stock: { decrement: item.qty } },
    });
  }
}

/**
 * 回滚库存（支付失败时）
 */
export async function releaseStock(items: Array<{ productId: string; qty: number }>): Promise<void> {
  for (const item of items) {
    await db.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.qty } },
    });
  }
}

/**
 * 生成交易流水号
 */
export function genTransactionId(channel: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${channel}-${ts}-${rand}`;
}

/**
 * 创建支付订单
 */
export async function createPayment(order: SettlementOrder, channel: string): Promise<PaymentResult> {
  const transactionId = genTransactionId(channel);
  await db.payment.create({
    data: {
      transactionId,
      orderId: order.id,
      amount: order.amount,
      channel,
      status: "PENDING",
    },
  });
  return { success: true, transactionId, paidAmount: order.amount, channel };
}

/**
 * 校验支付回调签名
 */
export function verifyPaymentCallback(payload: Record<string, string>, secret: string): boolean {
  const { sign, ...rest } = payload;
  if (!sign) return false;
  const content = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join("&");
  const expected = hashWithSecret(content, secret);
  return sign === expected;
}

/**
 * 用密钥对内容做简单哈希
 */
export function hashWithSecret(content: string, secret: string): string {
  let hash = 0;
  const data = `${secret}${content}${secret}`;
  for (let i = 0; i < data.length; i++) {
    const ch = data.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0;
  }
  return `h${Math.abs(hash).toString(16)}`;
}

/**
 * 确认支付成功，更新订单状态
 */
export async function confirmPayment(transactionId: string): Promise<boolean> {
  const payment = await db.payment.findUnique({ where: { transactionId } });
  if (!payment) return false;
  await db.payment.update({
    where: { transactionId },
    data: { status: "SUCCESS" },
  });
  await db.order.update({
    where: { id: payment.orderId },
    data: { status: "PAID" },
  });
  return true;
}

/**
 * 取消订单并释放库存
 */
export async function cancelOrder(orderId: string, items: Array<{ productId: string; qty: number }>): Promise<void> {
  await releaseStock(items);
  await db.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
  });
}

/**
 * 申请退款
 */
export async function applyRefund(orderId: string, reason: string, operator: string): Promise<RefundResult> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return { success: false, refundId: "", refundAmount: 0, reason };
  }
  const refundId = genTransactionId("RF");
  await db.refund.create({
    data: {
      refundId,
      orderId,
      amount: order.amount,
      reason,
      operator,
      status: "PENDING",
    },
  });
  return { success: true, refundId, refundAmount: order.amount, reason };
}

/**
 * 审核退款申请
 */
export async function approveRefund(refundId: string, approver: string): Promise<boolean> {
  const refund = await db.refund.findUnique({ where: { refundId } });
  if (!refund) return false;
  await db.refund.update({
    where: { refundId },
    data: { status: "APPROVED", approver },
  });
  return true;
}

/**
 * 拒绝退款申请
 */
export async function rejectRefund(refundId: string, approver: string, rejectReason: string): Promise<boolean> {
  const refund = await db.refund.findUnique({ where: { refundId } });
  if (!refund) return false;
  await db.refund.update({
    where: { refundId },
    data: { status: "REJECTED", approver, rejectReason },
  });
  return true;
}

/**
 * 执行退款（调用支付渠道）
 */
export async function executeRefund(refundId: string): Promise<RefundResult> {
  const refund = await db.refund.findUnique({ where: { refundId } });
  if (!refund) {
    return { success: false, refundId, refundAmount: 0, reason: "退款单不存在" };
  }
  // 模拟渠道回调
  await db.refund.update({
    where: { refundId },
    data: { status: "EXECUTED" },
  });
  return { success: true, refundId, refundAmount: refund.amount, reason: "渠道执行成功" };
}

/**
 * 按日期汇总对账数据
 */
export async function buildReconciliation(fromDate: string, toDate: string): Promise<ReconciliationRow[]> {
  const orders = await db.order.findMany({
    where: { createdAt: { gte: fromDate, lte: toDate } },
  });
  const refunds = await db.refund.findMany({
    where: { createdAt: { gte: fromDate, lte: toDate } },
  });

  const rows: ReconciliationRow[] = [];
  const dateMap = new Map<string, { orders: SettlementOrder[]; refunds: number[] }>();

  for (const o of orders) {
    const d = (o as { createdAt: string }).createdAt.slice(0, 10);
    if (!dateMap.has(d)) dateMap.set(d, { orders: [], refunds: [] });
    dateMap.get(d)!.orders.push(o as unknown as SettlementOrder);
  }
  for (const r of refunds) {
    const d = (r as { createdAt: string }).createdAt.slice(0, 10);
    if (!dateMap.has(d)) dateMap.set(d, { orders: [], refunds: [] });
    dateMap.get(d)!.refunds.push((r as { amount: number }).amount);
  }

  for (const [date, data] of dateMap) {
    const orderCount = data.orders.length;
    const grossAmount = data.orders.reduce((s, o) => s + o.amount, 0);
    const refundAmount = data.refunds.reduce((s, v) => s + v, 0);
    const discountAmount = 0;
    const netAmount = grossAmount - discountAmount - refundAmount;
    const settlementAmount = roundToCents(netAmount * 0.97);
    rows.push({
      date,
      orderCount,
      grossAmount: roundToCents(grossAmount),
      discountAmount,
      netAmount: roundToCents(netAmount),
      refundAmount: roundToCents(refundAmount),
      settlementAmount,
    });
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rows;
}

/**
 * 导出结算单
 */
export function exportSettlementRows(rows: ReconciliationRow[]): string {
  const header = "日期,订单数,总金额,折扣,净额,退款,结算额";
  const lines = rows.map(r =>
    [r.date, r.orderCount, r.grossAmount, r.discountAmount, r.netAmount, r.refundAmount, r.settlementAmount].join(","),
  );
  return [header, ...lines].join("\n");
}

/**
 * 生成结算批次号
 */
export function genSettlementBatchNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SET-${y}${m}${day}-${rand}`;
}

/**
 * 结算批次状态流转
 */
export type BatchStatus = "INIT" | "PROCESSING" | "SUCCESS" | "FAILED";

/**
 * 更新批次状态
 */
export async function updateBatchStatus(batchNo: string, status: BatchStatus): Promise<void> {
  await db.settlementBatch.update({
    where: { batchNo },
    data: { status },
  });
}

/**
 * 校验对账差异是否在容差内
 */
export function withinTolerance(actual: number, expected: number, tolerance = 0.01): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * 计算平台手续费
 */
export function calcPlatformFee(amount: number, rate = 0.006): number {
  return roundToCents(amount * rate);
}

/**
 * 计算商户到账金额
 */
export function calcMerchantSettlement(amount: number, fee: number): number {
  return roundToCents(amount - fee);
}

/**
 * 汇总某商户的日结算
 */
export async function settleMerchant(merchantId: string, date: string): Promise<number> {
  const orders = await db.order.findMany({
    where: { merchantId, status: "PAID", createdAt: { gte: `${date} 00:00:00`, lte: `${date} 23:59:59` } },
  });
  const gross = orders.reduce((s, o) => s + o.amount, 0);
  const fee = calcPlatformFee(gross);
  return calcMerchantSettlement(gross, fee);
}

/**
 * 创建结算明细行
 */
export async function createSettlementDetail(
  batchNo: string,
  orderId: string,
  amount: number,
  fee: number,
  settleAmount: number,
): Promise<void> {
  await db.settlementDetail.create({
    data: { batchNo, orderId, amount, fee, settleAmount, status: "PENDING" },
  });
}

/**
 * 标记结算明细完成
 */
export async function markSettlementDone(detailId: string): Promise<void> {
  await db.settlementDetail.update({
    where: { id: detailId },
    data: { status: "DONE" },
  });
}

/**
 * 查询结算批次明细
 */
export async function listSettlementDetails(batchNo: string): Promise<unknown[]> {
  return db.settlementDetail.findMany({ where: { batchNo } });
}

/**
 * 汇总批次结算总额
 */
export async function sumBatchAmount(batchNo: string): Promise<number> {
  const details = await db.settlementDetail.findMany({ where: { batchNo } });
  return details.reduce((s, d) => s + (d as { settleAmount: number }).settleAmount, 0);
}

/**
 * 判断批次是否可打款
 */
export function canDisburse(batchStatus: BatchStatus, sum: number, min: number): boolean {
  return batchStatus === "SUCCESS" && sum >= min;
}

/**
 * 打款回调处理
 */
export async function handleDisburseCallback(batchNo: string, success: boolean): Promise<void> {
  await updateBatchStatus(batchNo, success ? "SUCCESS" : "FAILED");
}

/**
 * 生成对账单标题
 */
export function buildStatementTitle(merchantName: string, month: string): string {
  return `${merchantName} ${month} 结算对账单`;
}

/**
 * 生成对账单页脚
 */
export function buildStatementFooter(genTime: string, operator: string): string {
  return `生成时间：${genTime} ｜ 操作人：${operator}`;
}

/**
 * 计算平均客单价
 */
export function calcAvgOrderValue(orders: SettlementOrder[]): number {
  if (orders.length === 0) return 0;
  const total = orders.reduce((s, o) => s + o.amount, 0);
  return roundToCents(total / orders.length);
}

/**
 * 计算退款率
 */
export function calcRefundRate(refundAmount: number, grossAmount: number): number {
  if (grossAmount === 0) return 0;
  return Math.min(100, roundToCents((refundAmount / grossAmount) * 100));
}

/**
 * 判断是否进入人工审核
 */
export function needManualReview(order: SettlementOrder, refundRate: number): boolean {
  return order.amount > 10000 || refundRate > 30;
}

/**
 * 发送结算通知（模拟）
 */
export async function sendSettlementNotification(batchNo: string, recipient: string): Promise<boolean> {
  await db.notification.create({
    data: { type: "SETTLEMENT", target: batchNo, recipient },
  });
  return true;
}

/**
 * 生成每日结算汇总标题
 */
export function dailySummaryTitle(date: string): string {
  return `结算汇总 ${date}`;
}

/**
 * 校验批次号格式
 */
export function isValidBatchNo(batchNo: string): boolean {
  return /^SET-\d{8}-[A-Z0-9]{4}$/.test(batchNo);
}

/**
 * 校验对账日期范围
 */
export function isValidDateRange(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  return from <= to;
}

/**
 * 格式化金额显示
 */
export function formatAmount(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

/**
 * 计算佣金（按比例）
 */
export function calcCommission(amount: number, rate = 0.03): number {
  return roundToCents(amount * rate);
}

/**
 * 扣除佣金后的结算额
 */
export function calcAfterCommission(amount: number, commission: number): number {
  return roundToCents(amount - commission);
}

/**
 * 统计订单状态分布
 */
export function countByStatus(orders: SettlementOrder[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const o of orders) {
    result[o.status] = (result[o.status] ?? 0) + 1;
  }
  return result;
}

/**
 * 找出金额最大的订单
 */
export function findLargestOrder(orders: SettlementOrder[]): SettlementOrder | null {
  if (orders.length === 0) return null;
  return orders.reduce((max, o) => (o.amount > max.amount ? o : max));
}

/**
 * 计算订单金额分段（用于报表）
 */
export function bucketByAmount(amount: number): string {
  if (amount < 100) return "0-100";
  if (amount < 500) return "100-500";
  if (amount < 1000) return "500-1000";
  if (amount < 5000) return "1000-5000";
  return "5000+";
}

/**
 * 计算同比增长率
 */
export function calcGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return roundToCents(((current - previous) / previous) * 100);
}

/**
 * 汇总多日数据
 */
export function aggregateMultiDay(rows: ReconciliationRow[]): ReconciliationRow {
  const base: ReconciliationRow = {
    date: "ALL",
    orderCount: 0,
    grossAmount: 0,
    discountAmount: 0,
    netAmount: 0,
    refundAmount: 0,
    settlementAmount: 0,
  };
  for (const r of rows) {
    base.orderCount += r.orderCount;
    base.grossAmount += r.grossAmount;
    base.discountAmount += r.discountAmount;
    base.netAmount += r.netAmount;
    base.refundAmount += r.refundAmount;
    base.settlementAmount += r.settlementAmount;
  }
  return base;
}

/**
 * 判断商户是否触发风控
 */
export function isRiskFlagged(amount: number, refundRate: number, disputeCount: number): boolean {
  return amount > 50000 || refundRate > 50 || disputeCount > 5;
}

/**
 * 生成风控工单号
 */
export function genRiskTicketNo(): string {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `RSK-${ts}-${rand}`;
}

/**
 * 提交风控工单
 */
export async function createRiskTicket(merchantId: string, reason: string): Promise<string> {
  const ticketNo = genRiskTicketNo();
  await db.riskTicket.create({ data: { ticketNo, merchantId, reason, status: "OPEN" } });
  return ticketNo;
}

/**
 * 关闭风控工单
 */
export async function closeRiskTicket(ticketNo: string, note: string): Promise<void> {
  await db.riskTicket.update({ where: { ticketNo }, data: { status: "CLOSED", note } });
}

/**
 * 查询商户是否被冻结
 */
export async function isMerchantFrozen(merchantId: string): Promise<boolean> {
  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  return merchant?.status === "FROZEN";
}

/**
 * 校验手机号格式
 */
export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * 校验邮箱格式
 */
export function isValidEmail(email: string): boolean {
  return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(email);
}

/**
 * 脱敏手机号
 */
export function maskPhone(phone: string): string {
  if (!isValidPhone(phone)) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}

/**
 * 脱敏邮箱
 */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const masked = name.length <= 2 ? name[0] + "*" : name.slice(0, 2) + "***";
  return `${masked}@${domain}`;
}

/**
 * 校验银行卡号（Luhn）
 */
export function isValidBankCard(cardNo: string): boolean {
  const digits = cardNo.replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * 脱敏银行卡号
 */
export function maskBankCard(cardNo: string): string {
  if (!isValidBankCard(cardNo)) return cardNo;
  return `${cardNo.slice(0, 4)} **** **** ${cardNo.slice(-4)}`;
}

/**
 * 生成结算导出文件名
 */
export function genExportFileName(batchNo: string, ext = "csv"): string {
  return `${batchNo}-settlement.${ext}`;
}

/**
 * 判断是否工作日（简单模拟）
 */
export function isWorkingDay(dateStr: string): boolean {
  const day = new Date(dateStr).getDay();
  return day !== 0 && day !== 6;
}

/**
 * 计算下一个结算日
 */
export function nextSettlementDate(fromDate: string): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  while (!isWorkingDay(d.toISOString().slice(0, 10))) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * 判断批次是否可归档
 */
export function isArchivable(batchNo: string, status: BatchStatus, createdAt: string): boolean {
  if (status !== "SUCCESS") return false;
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return now - created > 90 * 24 * 3600 * 1000;
}

/**
 * 归档批次（模拟）
 */
export async function archiveBatch(batchNo: string): Promise<void> {
  await db.settlementBatch.update({ where: { batchNo }, data: { archived: true } });
}

/**
 * 查询待打款批次
 */
export async function listPendingDisburse(limit = 100): Promise<unknown[]> {
  return db.settlementBatch.findMany({
    where: { status: "SUCCESS", disburseStatus: "PENDING" },
    take: limit,
  });
}

/**
 * 更新批次打款状态
 */
export async function markBatchDisbursed(batchNo: string): Promise<void> {
  await db.settlementBatch.update({ where: { batchNo }, data: { disburseStatus: "DONE" } });
}

/**
 * 汇总退款原因分布
 */
export function groupRefundByReason(refunds: Array<{ reason: string }>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const r of refunds) {
    result[r.reason] = (result[r.reason] ?? 0) + 1;
  }
  return result;
}

/**
 * 计算退款平均处理时长
 */
export function calcAvgRefundHours(refunds: Array<{ createdAt: string; handledAt?: string }>): number {
  const handled = refunds.filter(r => r.handledAt);
  if (handled.length === 0) return 0;
  const total = handled.reduce((sum, r) => {
    const ms = new Date(r.handledAt!).getTime() - new Date(r.createdAt).getTime();
    return sum + ms / 3600_000;
  }, 0);
  return roundToCents(total / handled.length);
}

/**
 * 判断是否超时未处理
 */
export function isTimeoutTicket(ticket: { createdAt: string }, hours = 24): boolean {
  const elapsed = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600_000;
  return elapsed > hours;
}

/**
 * 生成对账差异报告标题
 */
export function diffReportTitle(from: string, to: string): string {
  return `对账差异报告 ${from} ~ ${to}`;
}

/**
 * 统计差异订单
 */
export function countDiffOrders(expected: number, actual: number): number {
  return Math.abs(expected - actual);
}

/**
 * 计算差异率
 */
export function calcDiffRate(expected: number, actual: number): number {
  if (expected === 0) return actual === 0 ? 0 : 100;
  return roundToCents((Math.abs(actual - expected) / expected) * 100);
}

/**
 * 判断差异是否需上报
 */
export function needEscalateDiff(rate: number, threshold = 0.5): boolean {
  return rate > threshold;
}
