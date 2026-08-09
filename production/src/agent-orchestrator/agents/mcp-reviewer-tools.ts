/**
 * MCP 工具包装 — 供评审 Agent 调用 query_rule
 *
 * 直接调 MCP server 的 tool，不启动子进程
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";

const SERVER_ENTRY_SRC = path.resolve(
  import.meta.dirname, "..", "..", "mcp-server", "index.ts",
);

let client: Client | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;

  // CI 下用编译后的 dist/index.js（node 直接跑）；本地用 tsx 跑源码
  const isCI = !!process.env.GITHUB_ACTIONS;
  const serverEntry = isCI
    ? path.join(process.env.GITHUB_WORKSPACE!, "production", "src", "mcp-server", "dist", "index.js")
    : SERVER_ENTRY_SRC;

  const transport = new StdioClientTransport({
    command: isCI ? "node" : "npx",
    args: isCI ? [serverEntry] : ["tsx", serverEntry],
    // 显式传全量 env，保证 RULES_DIR / GITHUB_WORKSPACE 等传给 MCP server 子进程
    env: { ...(process.env as Record<string, string>) },
  });

  client = new Client({ name: "reviewer-agent", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

export async function queryRule(input: Record<string, unknown>): Promise<string> {
  const c = await getClient();
  const result = await c.callTool({
    name: "query_rule",
    arguments: {
      keyword: input.keyword ?? "",
      rule_id: input.rule_id,
    },
  });

  const text = (result.content as Array<{ type: string; text?: string }>)
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map(c => c.text)
    .join("\n");

  return text;
}
