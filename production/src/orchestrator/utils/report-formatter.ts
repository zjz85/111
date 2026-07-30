import type { Verdict, ReviewResult, PreprocessedPR, ReviewFinding } from "../../shared/types.js";

const WEIGHTS: Record<string, number> = {
  correctness: 0.40,
  readability: 0.20,
  maintainability: 0.25,
  evolvability: 0.15,
};

const DECISION_LABEL: Record<string, string> = {
  pass: "✅ 通过",
  reject: "❌ 打回",
  escalate: "⏸ 转人工",
};

const SEVERITY_LABEL: Record<string, string> = {
  reject: "🔴 打回",
  warning: "⚠️ 建议",
  suggestion: "💡 可选",
};

/**
 * 把 Verdict 转成 Markdown 报告文本
 */
export function formatReport(pr: PreprocessedPR, review: ReviewResult, verdict: Verdict): string {
  const m = pr.metadata;
  const lines: string[] = [];

  // ── 标题 ──────────────────────────────────────
  lines.push("## PR 自动初审报告");
  lines.push("");
  lines.push(`**PR:** #${m.number} ${m.title}`);
  lines.push(`**作者:** ${m.author}`);
  lines.push(`**判定:** ${DECISION_LABEL[verdict.decision] ?? verdict.decision}`);
  lines.push(`**变更文件:** ${m.changedFiles.join("、")}`);
  lines.push(`**有效代码行数:** ${pr.effectiveAddedLines}`);
  lines.push("");

  // ── 综合评分 ──────────────────────────────────
  lines.push("### 综合评分");
  lines.push("");
  lines.push("| 维度 | 得分 | 权重 | 加权 | 说明 |");
  lines.push("|------|------|------|------|------|");

  let totalWeighted = 0;
  for (const ds of review.dimensionScores) {
    const weight = WEIGHTS[ds.dimension] ?? 0.25;
    const weighted = ds.score * weight;
    totalWeighted += weighted;
    lines.push(`| ${ds.dimension} | ${ds.score}/5 | ${Math.round(weight * 100)}% | ${weighted.toFixed(1)} | ${ds.summary} |`);
  }

  lines.push(`| **总分** | | | **${totalWeighted.toFixed(2)}** | ${totalWeighted >= 3.0 ? "合格" : "不合格"} |`);
  lines.push("");

  // ── MCP 检查摘要 ──────────────────────────────
  lines.push("### 规范检查");
  lines.push("");

  for (const r of pr.mcpResults) {
    const icon = r.passed ? "✅" : "❌";
    lines.push(`- ${icon} **${r.tool}**: ${r.passed ? "通过" : r.hits.map(h => `${h.id} ${h.detail}`).join("；")}`);
  }
  lines.push("");

  // ── 问题清单 ──────────────────────────────────
  const allFindings = collectFindings(review, pr, verdict);
  if (allFindings.length > 0) {
    lines.push("### 问题清单");
    lines.push("");
    lines.push("| 文件 | 行号 | 维度 | 规范 | 级别 | 说明 |");
    lines.push("|------|------|------|------|------|------|");

    for (const f of allFindings) {
      const file = f.file || "—";
      const line = f.line > 0 ? String(f.line) : "—";
      const ruleId = f.ruleId || "—";
      lines.push(`| ${file} | ${line} | ${f.dimension} | ${ruleId} | ${SEVERITY_LABEL[f.severity] ?? f.severity} | ${f.summary} |`);
    }
    lines.push("");
  }

  // ── 判定原因 ──────────────────────────────────
  lines.push("### 最终判定");
  lines.push("");
  lines.push(`**${DECISION_LABEL[verdict.decision]}**`);
  lines.push("");
  lines.push(verdict.reason);
  lines.push("");

  // ── 风险扫描 ──────────────────────────────────
  if (pr.highRiskHit) {
    lines.push("### 高风险扫描");
    lines.push("");
    lines.push(`检测到高风险模式：${pr.highRiskTypes.join("、")}。建议人工复核。`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("_自动初审仅供参考，最终裁定由人工 Reviewer 确认_");

  return lines.join("\n");
}

function collectFindings(review: ReviewResult, pr: PreprocessedPR, verdict?: Verdict): ReviewFinding[] {
  // 直接打回时，从 verdict.findings 取，已包含全部打回项
  if (verdict?.decision === "reject" && verdict.findings.length > 0) {
    return verdict.findings;
  }

  const all: ReviewFinding[] = [];

  for (const r of pr.mcpResults) {
    for (const hit of r.hits) {
      all.push({
        file: hit.file ?? "",
        line: 0,
        dimension: "correctness",
        ruleId: hit.id,
        severity: hit.severity,
        summary: hit.id,
        detail: hit.detail,
      });
    }
  }

  for (const ds of review.dimensionScores) {
    for (const f of ds.findings) {
      all.push(f);
    }
  }

  return all;
}
