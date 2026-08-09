/**
 * 评审 Agent — 四维评审
 *
 * System prompt 来自 .claude/skills/four-dimensional-review.md（运行时读取）
 * 工具: query_rule (MCP)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import type { ToolExecutor } from "../utils/agent-loop.js";
import { queryRule } from "./mcp-reviewer-tools.js";

const SKILL_PATH = path.resolve(
  import.meta.dirname, "..", "..", "..", ".claude", "skills", "four-dimensional-review.md",
);

function loadSystemPrompt(): string {
  const raw = fs.readFileSync(SKILL_PATH, "utf-8");
  // 去掉 YAML frontmatter
  const body = raw.replace(/^---[\s\S]*?---\n*/, "").trim();
  return `${body}

## 输出格式

基于以上要求，最终必须以 JSON 格式输出评审结果：

{
  "scores": [
    {
      "dimension": "correctness",
      "score": 4,
      "summary": "整体评价",
      "findings": [
        {
          "file": "src/xxx.ts",
          "line": 42,
          "severity": "reject",
          "ruleId": "ARCH-001",
          "summary": "简短标题",
          "detail": "具体说明问题和改进建议（必含危害说明）"
        }
      ]
    }
  ],
  "uncertain": false,
  "uncertainReason": "若吃不准，说明缺失什么信息",
  "summary": "整体评审结论摘要"
}`;
}

export const REVIEWER_SYSTEM_PROMPT = loadSystemPrompt();

export const REVIEWER_TOOLS: Tool[] = [
  {
    name: "query_rule",
    description: "按关键字或规则 ID（如 ARCH-001）在全部团队规范中检索匹配的规则条款",
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: { type: "string", description: "检索关键字，如 'Controller'、'依赖'、'sleep'" },
        rule_id: { type: "string", description: "可选：按规则 ID 精确查询，如 'ARCH-001'" },
      },
      required: ["keyword"],
    },
  },
];

export const reviewerTools: ToolExecutor = {
  query_rule: queryRule,
};
