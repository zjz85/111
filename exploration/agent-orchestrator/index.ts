/**
 * Agent SDK 编排器 — CLI 入口
 *
 * 用法: npx tsx index.ts <pr-id>
 */

import { runAgent } from "./utils/agent-loop.js";
import { IMPLEMENTER_SYSTEM_PROMPT, IMPLEMENTER_TOOLS, implementerTools } from "./agents/implementer.js";
import { REVIEWER_SYSTEM_PROMPT, REVIEWER_TOOLS, reviewerTools } from "./agents/reviewer.js";
import { DECIDER_SYSTEM_PROMPT, DECIDER_TOOLS, deciderTools } from "./agents/decider.js";

const prId = process.argv[2];
if (!prId) {
  console.error("用法: npx tsx index.ts <pr-id>");
  console.error("示例: npx tsx index.ts pr-001");
  process.exit(1);
}

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

  // 打回记录：复用上面解析出的 decision
  if (parsedVerdict?.decision === "reject") {
    const rejectedDir = process.env.GITHUB_ACTIONS
      ? path.join(process.cwd(), "..", "..", "..", "rejected")
      : path.resolve(import.meta.dirname, "..", "..", "rejected");
    fs.mkdirSync(rejectedDir, { recursive: true });
    const rejectedPath = path.join(rejectedDir, `${prId}.md`);
    fs.writeFileSync(rejectedPath, reportBody, "utf-8");
    console.log(`[Rejected] 打回记录已写入: ${rejectedPath}`);
  }
}

main().catch(err => {
  console.error("Agent 编排失败:", err);
  process.exit(1);
});
