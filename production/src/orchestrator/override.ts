/**
 * 人工推翻打回判定 — CLI 入口
 *
 * 用法: npx tsx override.ts <pr-number>
 * 效果: 把该 PR 的评审记录标记 humanOverridden=true，并删除 rejected/{PR-ID}.md
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { markOverridden } from "./utils/record-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function main(): void {
  const prNumber = parseInt(process.argv[2], 10);
  if (isNaN(prNumber)) {
    console.error("用法: npx tsx override.ts <pr-number>");
    process.exit(1);
  }

  const prId = `PR-${String(prNumber).padStart(3, "0")}`;

  // 标记为人工推翻
  markOverridden(prId);
  console.log(`[Override] ${prId} 已标记 humanOverridden=true`);

  // 删除 rejected 记录
  const rejectedDir = process.env.GITHUB_ACTIONS
    ? path.join(process.cwd(), "..", "..", "..", "rejected")
    : path.join(REPO_ROOT, "rejected");
  const rejectedPath = path.join(rejectedDir, `${prId}.md`);
  if (fs.existsSync(rejectedPath)) {
    fs.unlinkSync(rejectedPath);
    console.log(`[Override] 已删除打回记录文件: ${rejectedPath}`);
  } else {
    console.log(`[Override] 未找到打回记录文件: ${rejectedPath}，跳过删除`);
  }
}

main();
