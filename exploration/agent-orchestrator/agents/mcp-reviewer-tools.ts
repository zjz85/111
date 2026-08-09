/**
 * MCP 工具包装 — 供评审 Agent 调用 query_rule
 *
 * 直接调 MCP server 的 tool，不启动子进程
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";

const SERVER_ENTRY = path.resolve(
  import.meta.dirname, "..", "..", "..", "production", "src", "mcp-server", "index.ts",
);

let client: Client | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;

  const transport = new StdioClientTransport({
    command: process.env.GITHUB_ACTIONS ? "node" : "npx",
    args: process.env.GITHUB_ACTIONS ? [SERVER_ENTRY] : ["tsx", SERVER_ENTRY],
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
