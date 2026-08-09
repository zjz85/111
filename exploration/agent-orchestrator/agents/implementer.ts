/**
 * 实施 Agent — 抓取并预处理 PR
 *
 * System prompt: 接收 PR 号 → 调 analyze_pr 工具 → 输出 PreprocessedPR
 */

import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import type { ToolExecutor } from "../utils/agent-loop.js";
import { analyzePr } from "../tools/analyze-pr.js";

export const IMPLEMENTER_SYSTEM_PROMPT = `你是 PR 实施分析助手。你的唯一任务是接收一个 PR 编号，调用 analyze_pr 工具获取 PR 的完整预处理信息。

## 工作流程

1. 收到 PR 编号后，立即调用 \`analyze_pr\` 工具
2. 等待工具返回结果
3. 将完整的 JSON 结果原样输出，不要修改或省略任何字段

## 约束

- 不要在没有调用工具的情况下编造数据
- 不要对结果做评审或判定
- 只输出一次工具调用结果即可`;

export const IMPLEMENTER_TOOLS: Tool[] = [
  {
    name: "analyze_pr",
    description: "抓取 PR 并做预处理：diff 分片、MCP 规范检查（复杂度/架构/安全）、高风险代码扫描。输入PR编号（如 'pr-001' 或 CI 模式下的数字），返回完整的 PreprocessedPR JSON。",
    input_schema: {
      type: "object" as const,
      properties: {
        prId: { type: "string", description: "PR 编号，如 'pr-001' 或 CI 模式下的 PR number" },
      },
      required: ["prId"],
    },
  },
];

export const implementerTools: ToolExecutor = {
  analyze_pr: async (input) => {
    const prId = String(input.prId ?? "");
    const pr = await analyzePr(prId);
    return JSON.stringify(pr, null, 2);
  },
};
