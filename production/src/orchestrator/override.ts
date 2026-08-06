import * as fs from "node:fs";
import * as path from "node:path";
import { markOverridden } from "./utils/record-store.js";

function isCI(): boolean {
  return !!process.env.GITHUB_ACTIONS;
}

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
  const rejectedDir = isCI()
    ? path.join(process.cwd(), "..", "..", "..", "rejected")
    : "e:\\大作业\\pr自动初评机器人\\rejected";
  const rejectedPath = path.join(rejectedDir, `${prId}.md`);
  if (fs.existsSync(rejectedPath)) {
    fs.unlinkSync(rejectedPath);
    console.log(`[Override] 已删除打回记录文件: ${rejectedPath}`);
  } else {
    console.log(`[Override] 未找到打回记录文件: ${rejectedPath}，跳过删除`);
  }
}

main();
