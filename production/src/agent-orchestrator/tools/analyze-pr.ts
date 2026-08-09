/**
 * PR 预处理工具（探索区版本）
 *
 * 直接读取 sample PR，绕过 production mcp-client 的 process.cwd() 路径问题
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { splitDiff, splitLargeChunks, effectiveAddedLines } from "../../orchestrator/utils/diff-splitter.js";
import { McpClient } from "../../orchestrator/utils/mcp-client.js";
import type { PRMetadata, PreprocessedPR, McpCheckResult } from "../../shared/types.js";

const SAMPLE_PRS_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "..", "exploration", "sample-prs");

const HIGH_RISK_PATTERNS = [
  { type: "db_operation", pattern: /\b(PrismaClient|db\.|\.query\(|\.execute\(|raw|transaction|createConnection)\b/ },
  { type: "core_interface", pattern: /\b(export interface|export type)\b/i },
  { type: "complex_logic", pattern: /if\s*\([^)]*\)\s*\{\s*if\s*\(/ },
];

function isCI(): boolean {
  return !!process.env.GITHUB_ACTIONS;
}

async function fetchGitHubPR(prNumber: number): Promise<PreprocessedPR> {
  const jsonRaw = execSync(
    `gh pr view ${prNumber} --json number,title,author,baseRefName,headRefName,createdAt,body,files`,
    { encoding: "utf-8" }
  );
  const data = JSON.parse(jsonRaw);

  const changedFiles: string[] = data.files.map((f: { path: string }) => f.path);

  const metadata: PRMetadata = {
    id: `PR-${String(prNumber).padStart(3, "0")}`,
    number: data.number,
    title: data.title,
    author: data.author?.login ?? "unknown",
    baseSha: data.baseRefName,
    headSha: data.headRefName,
    createdAt: data.createdAt,
    changedFiles,
    generatedFiles: [],
  };

  const diffText = execSync(`gh pr diff ${prNumber}`, { encoding: "utf-8" });
  return processPR({ metadata, diffText, prDescription: data.body ?? "" });
}

export async function analyzePr(prId: string): Promise<PreprocessedPR> {
  if (isCI()) {
    const num = parseInt(prId, 10);
    if (!isNaN(num)) return fetchGitHubPR(num);
    throw new Error(`CI 模式无法解析 PR number: ${prId}`);
  }

  const prDir = path.isAbsolute(prId) ? prId : path.join(SAMPLE_PRS_DIR, prId);

  const metaRaw = fs.readFileSync(path.join(prDir, "metadata.json"), "utf-8");
  const rawMeta = JSON.parse(metaRaw);
  const metadata: PRMetadata = {
    ...rawMeta,
    baseSha: rawMeta.base_sha,
    headSha: rawMeta.head_sha,
    createdAt: rawMeta.created_at,
    changedFiles: rawMeta.changed_files,
    generatedFiles: rawMeta.generated_files ?? [],
  };

  const diffText = fs.readFileSync(path.join(prDir, "changes.diff"), "utf-8");

  let prDescription = "";
  const descPath = path.join(prDir, "description.md");
  if (fs.existsSync(descPath)) {
    prDescription = fs.readFileSync(descPath, "utf-8").trim();
  }

  return processPR({ metadata, diffText, prDescription });
}

async function processPR(input: {
  metadata: PRMetadata;
  diffText: string;
  prDescription: string;
}): Promise<PreprocessedPR> {
  const { metadata, diffText, prDescription } = input;

  const hasFlagChange = metadata.changedFiles.some(
    f => f.includes("flags.yaml") || f.includes("config/flags") || f.includes("feature-flag")
  );

  const chunks = splitDiff(diffText, metadata.generatedFiles);
  const finalChunks = splitLargeChunks(chunks);
  const effectiveLines = effectiveAddedLines(finalChunks);
  const hasGeneratedFiles = metadata.generatedFiles.length > 0;

  // MCP 检查
  // mcp-client.ts 用 process.cwd() 相对路径解析 SERVER_ENTRY。
  // 从 exploration/ 跑时 cwd 不对，临时指向 production/src/mcp-server 源码（tsx 直接跑）
  const mcpResults: McpCheckResult[] = [];
  const mcp = new McpClient();
  try {
    await mcp.connect();
    const complexity = await mcp.checkComplexity({
      addedLines: effectiveLines,
      changedFiles: metadata.changedFiles.length,
      hasGeneratedFiles,
      prDescription: metadata.title,
    });
    mcpResults.push(complexity);

    const arch = await mcp.checkArchitecture({
      changedFiles: metadata.changedFiles,
      diffContent: diffText,
    });
    mcpResults.push(arch);

    const security = await mcp.checkSecurity({ diffContent: diffText });
    mcpResults.push(security);
  } catch (err) {
    console.error("[analyze-pr] MCP 检查失败:", String(err));
    mcpResults.push({
      tool: "mcp_error",
      passed: false,
      hits: [],
      rawText: `MCP 检查失败: ${String(err)}`,
    });
    // 继续执行，不中断
  } finally {
    try { await mcp.disconnect(); } catch { /* ok */ }
  }

  // 高风险扫描
  let highRiskHit = false;
  const highRiskTypes: string[] = [];
  for (const { type, pattern } of HIGH_RISK_PATTERNS) {
    if (pattern.test(diffText)) {
      highRiskHit = true;
      highRiskTypes.push(type);
    }
  }

  return {
    metadata,
    diffChunks: finalChunks,
    effectiveAddedLines: effectiveLines,
    hasGeneratedFiles,
    mcpResults,
    highRiskHit,
    highRiskTypes,
    prDescription,
    hasFlagChange,
  };
}
