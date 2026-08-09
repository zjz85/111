/**
 * 评审产物写入 — 报告 / 评审记录 / 打回记录 / 误判告警
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { appendRecord, checkMisrateAlert } from "../../orchestrator/utils/record-store.js";
import type { ReviewRecord } from "../../shared/types.js";

/** 仓库根目录（CI 用 GITHUB_WORKSPACE，本地从模块位置上溯） */
export function repoRoot(): string {
  return process.env.GITHUB_ACTIONS
    ? process.env.GITHUB_WORKSPACE!
    : path.resolve(import.meta.dirname, "..", "..", "..", "..");
}

/** rejected/ 目录 */
export function rejectedDir(): string {
  return process.env.GITHUB_ACTIONS
    ? path.join(process.env.GITHUB_WORKSPACE!, "rejected")
    : path.resolve(repoRoot(), "rejected");
}

/** 写报告文件（report.md） */
export function writeReport(reportBody: string): void {
  fs.writeFileSync("report.md", reportBody, "utf-8");
}

/** 写评审记录 */
export function writeReviewRecord(record: Omit<ReviewRecord, "timestamp"> & { timestamp?: string }): void {
  appendRecord({ ...record, timestamp: record.timestamp ?? new Date().toISOString() });
}

/** 写误判率告警（超阈值时） */
export function writeMisrateAlertIfAny(): void {
  const misrateAlert = checkMisrateAlert();
  if (misrateAlert) {
    console.error(`[Misrate] ${misrateAlert}`);
    fs.writeFileSync("misrate-alert.txt", misrateAlert, "utf-8");
  }
}

/** 写打回记录（仅 reject 时） */
export function writeRejectedIfReject(prId: string, reportBody: string, isReject: boolean): void {
  if (!isReject) return;
  const dir = rejectedDir();
  fs.mkdirSync(dir, { recursive: true });
  const rejectedPath = path.join(dir, `${prId}.md`);
  fs.writeFileSync(rejectedPath, reportBody, "utf-8");
  console.log(`[Rejected] 打回记录已写入: ${rejectedPath}`);
}
