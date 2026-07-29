import type { PreprocessedPR, ReviewResult, Verdict, ReviewFinding, Decision } from "../../shared/types.js";

const WEIGHTS: Record<string, number> = {
  correctness: 0.40,
  readability: 0.20,
  maintainability: 0.25,
  evolvability: 0.15,
};

/**
 * Stage3: 拿到 MCP 检查结果 + DeepSeek 评分 → 做出最终判定
 */
export function decide(pr: PreprocessedPR, review: ReviewResult): Verdict {
  const findings: ReviewFinding[] = [];
  const reasons: string[] = [];

  // ── 生成代码豁免 ──────────────────────────────
  if (pr.diffChunks.length > 0 && pr.diffChunks.every(c => c.isGenerated)) {
    return {
      prId: pr.metadata.id,
      decision: "pass",
      reason: `全部变更文件为自动生成代码（${pr.metadata.generatedFiles.join("、")}），MCP 规模检查已通过，豁免 DeepSeek 质量评审。`,
      findings,
      reportMarkdown: "",
    };
  }

  // ── 第 1 层：MCP 直接打回 ──────────────────────
  for (const r of pr.mcpResults) {
    for (const hit of r.hits) {
      if (hit.severity === "reject") {
        reasons.push(`规范违规：${hit.id} — ${hit.detail}`);
        findings.push({
          file: hit.file ?? "",
          line: 0,
          dimension: "correctness",
          ruleId: hit.id,
          severity: "reject",
          summary: hit.id,
          detail: hit.detail,
        });
      }
    }
  }

  if (pr.effectiveAddedLines > 500 && !pr.hasGeneratedFiles) {
    reasons.push(`有效代码 ${pr.effectiveAddedLines} 行超过 500 行阈值（SCOPE-001）`);
  }

  // ── 第 2 层：DeepSeek 评分判定 ─────────────────
  for (const ds of review.dimensionScores) {
    for (const f of ds.findings) {
      if (f.severity === "reject") {
        reasons.push(`DeepSeek 打回 [${f.dimension}]：${f.summary}`);
      }
      findings.push(f);
    }
  }

  // ── 第 3 层：加权总分 ──────────────────────────
  let weightedScore = 0;
  for (const ds of review.dimensionScores) {
    weightedScore += ds.score * (WEIGHTS[ds.dimension] ?? 0.25);
  }

  if (review.uncertain) {
    reasons.push(`DeepSeek 标记不确定：${review.uncertainReason ?? "未说明原因"}`);
    findings.push({
      file: "",
      line: 0,
      dimension: "correctness",
      severity: "warning",
      summary: "评审结果不确定",
      detail: review.uncertainReason ?? "",
    });
  }

  // ── 最终判定 ──────────────────────────────────
  const rejectReasons = reasons.filter(r => r.includes("打回") || r.includes("违规") || r.includes("超过"));
  const uncertainReasons = reasons.filter(r => r.includes("不确定"));

  let decision: Decision;
  let reason: string;

  if (rejectReasons.length > 0) {
    decision = "reject";
    reason = rejectReasons.join("；");
  } else if (uncertainReasons.length > 0 || weightedScore < 3.0) {
    decision = "escalate";
    reason = uncertainReasons.length > 0
      ? uncertainReasons.join("；")
      : `加权总分 ${weightedScore.toFixed(2)} 低于 3.0，转人工判断`;
  } else {
    decision = "pass";
    reason = `加权总分 ${weightedScore.toFixed(2)}，所有维度通过`;
  }

  return {
    prId: pr.metadata.id,
    decision,
    reason,
    findings,
    reportMarkdown: "",
  };
}
