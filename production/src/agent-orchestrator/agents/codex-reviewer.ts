/**
 * Codex-reviewer Agent — 高风险代码正确性深度检查
 *
 * System prompt 引用 .claude/agents/Codex-reviewer.md（运行时读取）
 * 无工具（纯分析 Agent，只需要 diff 全文）
 */

import * as fs from "node:fs";
import * as path from "node:path";

const SKILL_PATH = path.resolve(
  import.meta.dirname, "..", "..", "..", "..", ".claude", "agents", "Codex-reviewer.md",
);

function loadSystemPrompt(): string {
  const raw = fs.readFileSync(SKILL_PATH, "utf-8");
  return raw.replace(/^---[\s\S]*?---\n*/, "").trim();
}

export const CODEX_SYSTEM_PROMPT = loadSystemPrompt();
export const CODEX_TOOLS = []; // Codex 无工具，纯分析

/**
 * 构建 Codex-reviewer 的输入消息
 */
export function buildCodexInput(
  diffText: string,
  prDescription: string,
  highRiskTypes: string[],
): string {
  return `## PR Diff

${diffText}

## PR 描述

${prDescription}

## 触发原因

高风险代码扫描命中：${highRiskTypes.join("、")}

请对以上 Diff 做正确性深度检查（7 类：SQL 注入、空指针、逻辑错误、竞态条件、边界情况、语法错误、异常处理），按表格格式输出结果。`;
}
