import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";

// MCP Server 入口路径
const SERVER_ENTRY = process.env.GITHUB_ACTIONS
  ? path.join(process.env.GITHUB_WORKSPACE!, "production", "src", "mcp-server", "dist", "index.js")
  : path.resolve(process.cwd(), "..", "mcp-server", "dist", "index.js");

export interface McpCheckResult {
  tool: string;
  passed: boolean;
  hits: Array<{ id: string; severity: "reject" | "warning"; detail: string; file?: string }>;
  rawText: string;
}

export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(): Promise<void> {
    const isCI = !!process.env.GITHUB_ACTIONS;
    this.transport = new StdioClientTransport({
      command: isCI ? "node" : "npx",
      args: isCI ? [SERVER_ENTRY] : ["tsx", SERVER_ENTRY],
    });

    this.client = new Client(
      { name: "orchestrator", version: "1.0.0" },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
  }

  async checkComplexity(params: {
    addedLines: number;
    deletedLines?: number;
    changedFiles?: number;
    hasGeneratedFiles?: boolean;
    prDescription?: string;
  }): Promise<McpCheckResult> {
    return this.callTool("check_complexity", {
      added_lines: params.addedLines,
      deleted_lines: params.deletedLines,
      changed_files: params.changedFiles,
      has_generated_files: params.hasGeneratedFiles,
      pr_description: params.prDescription,
    });
  }

  async checkArchitecture(params: {
    changedFiles: string[];
    diffContent?: string;
  }): Promise<McpCheckResult> {
    return this.callTool("check_architecture", {
      changed_files: params.changedFiles,
      diff_content: params.diffContent,
    });
  }

  async checkSecurity(params: {
    diffContent: string;
  }): Promise<McpCheckResult> {
    return this.callTool("check_security", {
      diff_content: params.diffContent,
    });
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<McpCheckResult> {
    if (!this.client) throw new Error("MCP client not connected");

    const result = await this.client.callTool({ name, arguments: args });

    const rawText = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map(c => c.text)
      .join("\n");

    const passed = !rawText.includes("🔴");

    const hits: McpCheckResult["hits"] = [];
    const hitPattern = /-\s*\*\*[🔴⚠️]*\s*(\w+-\d+)\*\*.*?:\s*(.+)/g;
    let match: RegExpExecArray | null;
    while ((match = hitPattern.exec(rawText)) !== null) {
      hits.push({
        id: match[1],
        severity: passed ? "warning" : "reject",
        detail: match[2],
      });
    }

    return { tool: name, passed, hits, rawText };
  }
}
