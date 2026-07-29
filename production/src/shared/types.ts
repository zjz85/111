// ─── PR & Diff ───────────────────────────────────────────

export interface PRMetadata {
  id: string;
  number: number;
  title: string;
  author: string;
  baseSha: string;
  headSha: string;
  createdAt: string;
  changedFiles: string[];
  generatedFiles: string[];
}

export interface DiffChunk {
  file: string;
  content: string;
  addedLines: number;
  deletedLines: number;
  isGenerated: boolean;
  isDoc: boolean;
  isLockfile: boolean;
}

export interface McpCheckResult {
  tool: string;
  passed: boolean;
  hits: Array<{ id: string; severity: "reject" | "warning"; detail: string; file?: string }>;
  rawText: string;
}

export interface PreprocessedPR {
  metadata: PRMetadata;
  diffChunks: DiffChunk[];
  effectiveAddedLines: number;
  hasGeneratedFiles: boolean;
  mcpResults: McpCheckResult[];
  highRiskHit: boolean;
  highRiskTypes: string[];
  prDescription: string;
  hasFlagChange: boolean;
}

// ─── 评审结果 ────────────────────────────────────────────

export type Dimension = "correctness" | "readability" | "maintainability" | "evolvability";

export type FindingSeverity = "reject" | "warning" | "suggestion";

export interface ReviewFinding {
  file: string;
  line: number;
  dimension: Dimension;
  ruleId?: string;
  severity: FindingSeverity;
  summary: string;
  detail: string;
}

export interface DimensionScore {
  dimension: Dimension;
  score: number; // 1-5
  summary: string;
  findings: ReviewFinding[];
}

export interface ReviewResult {
  prId: string;
  dimensionScores: DimensionScore[];
  uncertain: boolean;
  uncertainReason?: string;
  summary: string;
}

// ─── 判定结果 ────────────────────────────────────────────

export type Decision = "pass" | "reject" | "escalate";

export interface Verdict {
  prId: string;
  decision: Decision;
  reason: string;
  findings: ReviewFinding[];
  reportMarkdown: string;
}

// ─── 双模型记录 ──────────────────────────────────────────

export type DualModelTrigger = "sensitive_keyword" | "boundary_score" | "uncertain_flag";

export interface DualModelRecord {
  prId: string;
  triggeredBy: DualModelTrigger;
  primaryModel: string;
  primaryDecision: Decision;
  primaryScores: Array<{ dimension: string; score: number }>;
  secondaryModel: string;
  secondaryDecision: Decision;
  secondaryScores: Array<{ dimension: string; score: number }>;
  consistent: boolean;
  finalDecision: Decision;
  timestamp: string;
}

// ─── 全量评审记录（误判率监控用） ──────────────────────

export interface ReviewRecord {
  prId: string;
  prNumber: number;
  prTitle: string;
  decision: Decision;
  weightedScore: number;
  hitRules: string[];
  highRiskHit: boolean;
  dualModelUsed: boolean;
  humanOverridden: boolean;
  timestamp: string;
}
