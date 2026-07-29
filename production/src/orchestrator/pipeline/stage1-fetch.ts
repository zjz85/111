import * as fs from "node:fs";
import * as path from "node:path";
import { splitDiff, splitLargeChunks, effectiveAddedLines } from "../utils/diff-splitter.js";
import { McpClient } from "../utils/mcp-client.js";
import type { PRMetadata, PreprocessedPR } from "../../shared/types.js";

const SAMPLE_PRS_DIR = "e:\\大作业\\pr自动初评机器人\\exploration\\sample-prs";

// 高风险代码关键词扫描
const HIGH_RISK_PATTERNS = [
  { type: "db_operation", pattern: /\b(PrismaClient|db\.|\.query\(|\.execute\(|raw|transaction|createConnection)\b/ },
  { type: "core_interface", pattern: /\b(export interface|export type)\b/i },
  { type: "complex_logic", pattern: /if\s*\([^)]*\)\s*\{\s*if\s*\(/ },
];

/**
 * 读取一个 sample PR 并做预处理。
 * prDir 可以是 "pr-001" 或完整路径。
 */
export async function fetchPR(prId: string): Promise<PreprocessedPR> {
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

  // 读取 description.md（如果存在）
  let prDescription = "";
  const descPath = path.join(prDir, "description.md");
  if (fs.existsSync(descPath)) {
    prDescription = fs.readFileSync(descPath, "utf-8").trim();
  }

  // 检测 feature flag 相关变更
  const hasFlagChange = metadata.changedFiles.some(
    f => f.includes("flags.yaml") || f.includes("config/flags") || f.includes("feature-flag")
  );

  // ── Step 1: 分片 ──────────────────────────────
  const chunks = splitDiff(diffText, metadata.generatedFiles);
  const finalChunks = splitLargeChunks(chunks);
  const effectiveLines = effectiveAddedLines(finalChunks);
  const hasGeneratedFiles = metadata.generatedFiles.length > 0;

  // ── Step 2: 调 MCP 查规范 ─────────────────────
  const mcp = new McpClient();
  const mcpResults: PreprocessedPR["mcpResults"] = [];
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
  } finally {
    await mcp.disconnect();
  }

  // ── Step 3: 高风险扫描 ────────────────────────
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
