/**
 * 决策 Agent — 综合评审结果做最终判定 + 写报告
 *
 * System prompt 引用 .claude/skills/markdown-geshihua.md（运行时读取）+ 判定逻辑
 * 工具: read_records
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import type { ToolExecutor } from "../utils/agent-loop.js";
import { loadRecords } from "../../../production/src/orchestrator/utils/record-store.js";
import { runAgent } from "../utils/agent-loop.js";
import { CODEX_SYSTEM_PROMPT, CODEX_TOOLS, buildCodexInput } from "./codex-reviewer.js";

const FORMAT_SKILL_PATH = path.resolve(
  import.meta.dirname, "..", "..", "..", ".claude", "skills", "markdown-geshihua.md",
);

function loadSystemPrompt(): string {
  const formatRaw = fs.readFileSync(FORMAT_SKILL_PATH, "utf-8");
  const formatBody = formatRaw.replace(/^---[\s\S]*?---\n*/, "").trim();

  return `你是 PR 决策助手。你接收实施 Agent 的 PreprocessedPR 和评审 Agent 的 ReviewResult，做出最终判定并生成评审报告。

## 可用工具

- **codex_review**：当 PreprocessedPR.highRiskHit 为 true 或评审 Agent 发现严重正确性问题时，调用此工具进行高风险代码的 7 类正确性深度检查（SQL 注入/空指针/逻辑错误/竞态条件/边界情况/语法错误/异常处理）。输入 highRiskTypes 和 diff 全文。
- **read_records**：读取历史评审记录，查看误判趋势和同类 PR 的处理结果。

## 判定规则

综合以下信息做出判定：

1. **MCP 直接打回**：PreprocessedPR.mcpResults 中 severity=reject 的项直接打回
2. **四维评分**：加权总分（正确性 40%、可维护性 25%、可读性 20%、可演进性 15%）低于 3.0 或者有 reject severity 的打回项 → 打回
3. **不确定标记**：评审 Agent 标记了 uncertain → 升级人工
4. **高风险代码复审**：若 highRiskHit 为 true 或正确性维度有打回项，必须调用 codex_review 做专项正确性检查，将其输出作为报告附录
5. **历史误判**：可以调 read_records 查看历史评审记录，避免重复误判

判定结果：
- **pass**：所有维度通过，无打回项，加权分 ≥ 3.0
- **reject**：存在打回项
- **escalate**：不确定 / 边界模糊 / 双审不一致 → 转人工

## 输出要求

1. 先输出最终判定结论：**pass** / **reject** / **escalate**，附带原因
2. 然后按以下格式规范生成完整的评审报告 Markdown：

${formatBody}

## 报告结构

报告用以下章节：

1. \`## PR 自动初审报告\` — PR 元信息（编号、标题、作者、判定）
2. \`### 综合评分\` — 四维评分表
3. \`### 规范检查\` — MCP 检查摘要
4. \`### 问题清单\` — 评审发现的问题表格
5. \`### 最终判定\` — 判定结论和原因

## 最终输出格式

请用以下 JSON 输出（不要 markdown 代码块）：

{
  "decision": "pass",
  "reason": "加权总分 3.85，所有维度通过",
  "needDualReview": false,
  "dualReviewReason": "",
  "reportMarkdown": "完整的 Markdown 报告..."
}`;
}

export const DECIDER_SYSTEM_PROMPT = loadSystemPrompt();

export const DECIDER_TOOLS: Tool[] = [
  {
    name: "codex_review",
    description: "调用 Codex-reviewer 专项正确性检查。当 PreprocessedPR.highRiskHit 为 true 或正确性维度有打回项时必须调用。输入 highRiskTypes 和 diff 全文，输出 7 类检查结果表格。",
    input_schema: {
      type: "object" as const,
      properties: {
        highRiskTypes: { type: "string", description: "高风险类型，逗号分隔，如 'db_operation,core_interface'" },
        prDescription: { type: "string", description: "PR 描述" },
      },
      required: ["highRiskTypes"],
    },
  },
  {
    name: "read_records",
    description: "读取历史评审记录，查看误判趋势和同类 PR 的处理结果",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

export const deciderTools: ToolExecutor = {
  codex_review: async (input) => {
    const highRiskTypesStr = String(input.highRiskTypes ?? "");
    const prDescription = String(input.prDescription ?? "");
    // 从当前上下文获取 diff — decider Agent 已经收到了完整的 PreprocessedPR
    // 构造输入让 Codex Agent 运行
    const codexInput = buildCodexInput(
      "[Diff 已嵌入上下文，由实施 Agent 提供]",
      prDescription,
      highRiskTypesStr.split(",").map(s => s.trim()).filter(Boolean),
    );

    const { text } = await runAgent(
      { model: "deepseek-v4-flash", systemPrompt: CODEX_SYSTEM_PROMPT, tools: CODEX_TOOLS, temperature: 0.1, maxTokens: 4096 },
      {},
      codexInput,
    );
    return text;
  },

  read_records: async () => {
    const records = loadRecords();
    if (records.length === 0) return "暂无历史评审记录。";
    // 只返回摘要，避免过长
    const summary = records.slice(-10).map(r =>
      `[${r.prId}] ${r.decision} | 加权分: ${r.weightedScore} | 命中: ${r.hitRules.join(",") || "无"} | 双审: ${r.dualModelUsed ? "是" : "否"} | 人工推翻: ${r.humanOverridden ? "是" : "否"}`
    ).join("\n");
    return `最近 ${Math.min(10, records.length)} 条评审记录:\n${summary}`;
  },
};
