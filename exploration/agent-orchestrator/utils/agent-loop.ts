/**
 * Agent Loop — 通用 Anthropic SDK tool-use 循环
 *
 * 职责：给定 system prompt + 工具定义 + 初始消息，跑 tool-use 循环直到 end_turn
 * 不做：不包含任何业务逻辑
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

const MAX_TURNS = 10;

export interface AgentConfig {
  model: string;
  systemPrompt: string;
  tools: Tool[];
  maxTokens?: number;
  temperature?: number;
}

export interface ToolExecutor {
  [name: string]: (input: Record<string, unknown>) => Promise<string>;
}

// CI 下直连 DeepSeek 官方 Anthropic 兼容端点（需 Bearer token）；
// 本地走 cc switch 代理（认 x-api-key）
const isCI = !!process.env.GITHUB_ACTIONS;
const client = isCI
  ? new Anthropic({
      baseURL: "https://api.deepseek.com/anthropic",
      authToken: process.env.DEEPSEEK_API_KEY || "",
      timeout: 300_000,
      maxRetries: 2,
    })
  : new Anthropic({
      baseURL: process.env.ANTHROPIC_BASE_URL || "http://127.0.0.1:15721",
      apiKey: process.env.ANTHROPIC_AUTH_TOKEN || "PROXY_MANAGED",
      timeout: 300_000,
      maxRetries: 2,
    });

/**
 * Run a single agent: send messages, execute tool calls, loop until end_turn.
 * Returns the final text output from the model.
 */
export async function runAgent(
  config: AgentConfig,
  toolExecutor: ToolExecutor,
  initialMessage: string,
): Promise<{ text: string; toolCalls: Array<{ name: string; input: Record<string, unknown>; output: string }> }> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: initialMessage },
  ];

  const toolCallLog: Array<{ name: string; input: Record<string, unknown>; output: string }> = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.1,
      system: config.systemPrompt,
      messages,
      tools: config.tools,
    });

    // Collect text and tool_use blocks
    const textBlocks: string[] = [];
    const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textBlocks.push(block.text);
      } else if (block.type === "tool_use") {
        toolUseBlocks.push(block);
      }
    }

    // If end_turn, return accumulated text
    if (response.stop_reason === "end_turn") {
      return { text: textBlocks.join("\n"), toolCalls: toolCallLog };
    }

    // If tool_use, execute tools and continue
    if (response.stop_reason === "tool_use" && toolUseBlocks.length > 0) {
      // Push assistant message with tool_use blocks
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const executor = toolExecutor[block.name];
        let output: string;

        if (executor) {
          try {
            output = await executor(block.input as Record<string, unknown>);
          } catch (err) {
            output = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        } else {
          output = `Error: unknown tool "${block.name}"`;
        }

        toolCallLog.push({ name: block.name, input: block.input as Record<string, unknown>, output });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Unexpected stop_reason — return what we have
    return { text: textBlocks.join("\n") || `[stop_reason: ${response.stop_reason}]`, toolCalls: toolCallLog };
  }

  return { text: "[Agent loop exceeded max turns]", toolCalls: toolCallLog };
}
