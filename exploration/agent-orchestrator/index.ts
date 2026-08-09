/**
 * Agent SDK 编排器 — CLI 入口
 *
 * 用法: npx tsx index.ts <pr-id>
 */

import { runAgent } from "./utils/agent-loop.js";
import { IMPLEMENTER_SYSTEM_PROMPT, IMPLEMENTER_TOOLS, implementerTools } from "./agents/implementer.js";
import { REVIEWER_SYSTEM_PROMPT, REVIEWER_TOOLS, reviewerTools } from "./agents/reviewer.js";
import { DECIDER_SYSTEM_PROMPT, DECIDER_TOOLS, deciderTools } from "./agents/decider.js";
import { appendRecord, checkMisrateAlert } from "../../production/src/orchestrator/utils/record-store.js";

const prId = process.argv[2];
if (!prId) {
  console.error("用法: npx tsx index.ts <pr-id>");
  console.error("示例: npx tsx index.ts pr-001");
  process.exit(1);
}

/** 归一化 PR ID：任意输入（11 / pr-001 / PR-001）转成 PR-XXX（补零 3 位） */
function normalizePrId(raw: string): string {
  const digits = raw.match(/\d+/)?.[0] ?? "";
  return `PR-${digits.padStart(3, "0")}`;
}
const normalizedPrId = normalizePrId(prId);

async function main() {
  const model = "deepseek-v4-flash";

  // ──── Stage 1: 实施 Agent ────
  console.log("[Agent 1/3] 实施 Agent 抓取 PR...");
  const { text: prText } = await runAgent(
    { model, systemPrompt: IMPLEMENTER_SYSTEM_PROMPT, tools: IMPLEMENTER_TOOLS, maxTokens: 12000 },
    implementerTools,
    `请分析 PR: ${prId}`,
  );
  console.log(`  实施 Agent 完成 (${prText.length} 字符)`);

  // ──── Stage 2: 评审 Agent ────
  console.log("[Agent 2/3] 评审 Agent 四维评审...");
  const reviewInput = `以下是 PR 预处理结果和 diff，请进行四维评审：

## PreprocessedPR

${prText}

请先查阅相关规范（query_rule），然后对变更做四维评审，按 JSON 格式输出结果。`;
  const { text: reviewText } = await runAgent(
    { model, systemPrompt: REVIEWER_SYSTEM_PROMPT, tools: REVIEWER_TOOLS, maxTokens: 12000 },
    reviewerTools,
    reviewInput,
  );
  console.log(`  评审 Agent 完成 (${reviewText.length} 字符)`);

  // ──── Stage 3: 决策 Agent ────
  console.log("[Agent 3/3] 决策 Agent 做最终判定...");
  const verifyInput = `## PreprocessedPR

${prText}

## ReviewResult

${reviewText}

请综合以上信息，做出最终判定并生成报告。可以调用 read_records 查看历史评审记录。`;
  const { text: verdictText } = await runAgent(
    { model, systemPrompt: DECIDER_SYSTEM_PROMPT, tools: DECIDER_TOOLS, maxTokens: 12000 },
    deciderTools,
    verifyInput,
  );
  console.log(`  决策 Agent 完成`);

  // ──── 输出 ────
  // 决策 Agent 输出 JSON，报告文件只取 reportMarkdown，解析失败则回退全文
  let parsedVerdict: { decision?: string; reportMarkdown?: string } | null = null;
  try {
    const jsonMatch = verdictText.match(/\{[\s\S]*"decision"[\s\S]*\}/);
    if (jsonMatch) parsedVerdict = JSON.parse(jsonMatch[0]);
  } catch {
    // 解析失败忽略，回退全文
  }

  const reportBody = parsedVerdict?.reportMarkdown || verdictText;

  console.log("\n══════════════════════════════════════════");
  console.log("最终判定:\n");
  console.log(reportBody);

  // 写 report.md（只写报告正文，不写外层 JSON 壳）
  const fs = await import("node:fs");
  const path = await import("node:path");
  const reportPath = "report.md";
  fs.writeFileSync(reportPath, reportBody, "utf-8");
  console.log(`\n[Report] 报告已写入: ${reportPath}`);

  // 写评审记录（误判率监控数据源）
  const decisionRaw = parsedVerdict?.decision
    || (/(打回|拒绝|reject)/i.test(reportBody.slice(0, 500)) ? "reject"
      : /(升级人工|转人工|escalate)/i.test(reportBody.slice(0, 500)) ? "escalate"
      : "pass");
  const decision = decisionRaw as "pass" | "reject" | "escalate";
  const prNumber = parseInt(prId.replace(/\D/g, ""), 10) || 0;
  appendRecord({
    prId: normalizedPrId,
    prNumber,
    prTitle: "PR 自动初审",
    decision,
    weightedScore: 0,
    hitRules: [],
    highRiskHit: false,
    dualModelUsed: false,
    humanOverridden: false,
    timestamp: new Date().toISOString(),
  });
  console.log(`[Record] 评审记录已写入: decision=${decision}`);

  // 误判率监控：超阈值输出告警（打回被 override 推翻的占比）
  const misrateAlert = checkMisrateAlert();
  if (misrateAlert) {
    console.error(`[Misrate] ${misrateAlert}`);
    fs.writeFileSync("misrate-alert.txt", misrateAlert, "utf-8");
  }

  // 打回记录：decision 为 reject（或报告正文含明确打回判定，兜底解析失败）必须写入 rejected/
  // 注意避免误报："无 reject 项"、"未触发打回" 等字样不含明确判定词
  const isReject = decision === "reject"
    || /(打回|拒绝|判定.*reject|reject.*判定|❌.*拒绝)/i.test(reportBody.slice(0, 500))
    || /"decision"\s*:\s*"reject"/i.test(reportBody.slice(0, 1000));
  if (isReject) {
    const rejectedDir = process.env.GITHUB_ACTIONS
      ? path.join(process.env.GITHUB_WORKSPACE!, "rejected")
      : path.resolve(import.meta.dirname, "..", "..", "rejected");
    fs.mkdirSync(rejectedDir, { recursive: true });
    const rejectedPath = path.join(rejectedDir, `${normalizedPrId}.md`);
    fs.writeFileSync(rejectedPath, reportBody, "utf-8");
    console.log(`[Rejected] 打回记录已写入: ${rejectedPath}`);
  }
}

main()
  .then(() => {
    // 显式退出，释放 MCP client / HTTP 等未关闭句柄，避免进程挂起导致 CI 卡住
    process.exit(0);
  })
  .catch(err => {
    console.error("Agent 编排失败:", err);
    process.exit(1);
  });
