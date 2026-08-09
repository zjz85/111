import * as fs from "node:fs";
import * as path from "node:path";
import type { ReviewRecord } from "../../shared/types.js";

const DATA_DIR = process.env.GITHUB_ACTIONS
  ? path.join(process.env.GITHUB_WORKSPACE!, "production", "data")
  : path.join("e:\\大作业\\pr自动初评机器人\\production", "data");
const RECORDS_FILE = path.join(DATA_DIR, "review-records.json");

/**
 * 读全部评审记录
 */
export function loadRecords(): ReviewRecord[] {
  if (!fs.existsSync(RECORDS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(RECORDS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * 追加一条评审记录并保存
 */
export function appendRecord(record: ReviewRecord): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const existing = loadRecords();
  existing.push(record);
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(existing, null, 2), "utf-8");
}

/**
 * 标记某 PR 被人工伤推翻
 */
export function markOverridden(prId: string): void {
  const records = loadRecords();
  let found = false;
  for (const r of records) {
    if (r.prId === prId) {
      r.humanOverridden = true;
      found = true;
      break;
    }
  }
  if (found) {
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), "utf-8");
  }
}

/**
 * 计算误判率
 * misrate = 被推翻的打回 / 总打回数
 */
export function calcMisrate(): { rate: number; totalRejected: number; overridden: number } {
  const records = loadRecords();
  const rejected = records.filter(r => r.decision === "reject");
  const overridden = rejected.filter(r => r.humanOverridden);
  return {
    rate: rejected.length > 0 ? overridden.length / rejected.length : 0,
    totalRejected: rejected.length,
    overridden: overridden.length,
  };
}

/**
 * 误判率告警检查，超过阈值返回告警信息
 */
export function checkMisrateAlert(threshold = 0.15): string | null {
  const { rate, totalRejected, overridden } = calcMisrate();
  if (totalRejected >= 5 && rate > threshold) {
    return `⚠️ 误判率告警：${(rate * 100).toFixed(1)}%（${overridden}/${totalRejected}）超过 ${(threshold * 100).toFixed(0)}% 阈值，建议检查规则配置。`;
  }
  return null;
}
