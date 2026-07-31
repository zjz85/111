import { describe, it, expect } from "vitest";
import { formatReport } from "../utils/report-formatter.js";
import type { PreprocessedPR, ReviewResult, Verdict } from "../../shared/types.js";

function mkPr(overrides: Record<string, unknown> = {}): PreprocessedPR {
  return {
    metadata: {
      id: "PR-001",
      number: 1,
      title: "Add order validation",
      author: "zjz",
      baseSha: "a",
      headSha: "b",
      createdAt: "2026-01-01",
      changedFiles: ["src/order.ts"],
      generatedFiles: [],
    },
    diffChunks: [],
    effectiveAddedLines: 20,
    hasGeneratedFiles: false,
    mcpResults: [],
    highRiskHit: false,
    highRiskTypes: [],
    prDescription: "",
    hasFlagChange: false,
    ...overrides,
  };
}

function mkReview(overrides: Record<string, unknown> = {}): ReviewResult {
  return {
    prId: "PR-001",
    dimensionScores: [],
    uncertain: false,
    summary: "",
    ...overrides,
  };
}

describe("formatReport", () => {
  it("renders pass verdict label", () => {
    const report = formatReport(mkPr(), mkReview(), { prId: "PR-001", decision: "pass", reason: "ok", findings: [], reportMarkdown: "" } as Verdict);
    expect(report).toContain("✅ 通过");
    expect(report).toContain("PR 自动初审报告");
  });

  it("renders reject verdict label", () => {
    const report = formatReport(mkPr(), mkReview(), { prId: "PR-001", decision: "reject", reason: "SCOPE-001", findings: [], reportMarkdown: "" } as Verdict);
    expect(report).toContain("❌ 打回");
  });

  it("renders escalate verdict label", () => {
    const report = formatReport(mkPr(), mkReview(), { prId: "PR-001", decision: "escalate", reason: "不确定", findings: [], reportMarkdown: "" } as Verdict);
    expect(report).toContain("⏸ 转人工");
  });

  it("shows PR metadata and effective line count", () => {
    const report = formatReport(
      mkPr({ effectiveAddedLines: 42 }),
      mkReview(),
      { prId: "PR-001", decision: "pass", reason: "ok", findings: [], reportMarkdown: "" } as Verdict
    );
    expect(report).toContain("#1 Add order validation");
    expect(report).toContain("42");
    expect(report).toContain("src/order.ts");
  });

  it("renders dimension scores table", () => {
    const review = mkReview({
      dimensionScores: [
        { dimension: "correctness", score: 4, summary: "逻辑正确", findings: [] },
        { dimension: "readability", score: 4, summary: "清晰", findings: [] },
      ],
    });
    const report = formatReport(mkPr(), review, { prId: "PR-001", decision: "pass", reason: "ok", findings: [], reportMarkdown: "" } as Verdict);
    expect(report).toContain("correctness");
    expect(report).toContain("总分");
  });

  it("shows findings in issue list", () => {
    const review = mkReview({
      dimensionScores: [{
        dimension: "correctness",
        score: 2,
        summary: "有风险",
        findings: [{ file: "src/order.ts", line: 5, dimension: "correctness", severity: "warning", summary: "边界未覆盖", detail: "空值会崩" }],
      }],
    });
    const report = formatReport(mkPr(), review, { prId: "PR-001", decision: "escalate", reason: "低分", findings: [], reportMarkdown: "" } as Verdict);
    expect(report).toContain("边界未覆盖");
    expect(report).toContain("src/order.ts");
  });

  it("shows high risk scan section when triggered", () => {
    const pr = mkPr({ highRiskHit: true, highRiskTypes: ["db_operation"] });
    const report = formatReport(pr, mkReview(), { prId: "PR-001", decision: "pass", reason: "ok", findings: [], reportMarkdown: "" } as Verdict);
    expect(report).toContain("高风险扫描");
    expect(report).toContain("db_operation");
  });

  it("does not show high risk section when not triggered", () => {
    const report = formatReport(mkPr(), mkReview(), { prId: "PR-001", decision: "pass", reason: "ok", findings: [], reportMarkdown: "" } as Verdict);
    expect(report).not.toContain("高风险扫描");
  });

  it("shows MCP check summary", () => {
    const pr = mkPr({
      mcpResults: [{
        tool: "check_security",
        passed: false,
        hits: [{ id: "SEC-001", severity: "reject", detail: "硬编码密码" }],
        rawText: "x",
      }],
    });
    const report = formatReport(pr, mkReview(), { prId: "PR-001", decision: "reject", reason: "SEC-001", findings: [], reportMarkdown: "" } as Verdict);
    expect(report).toContain("check_security");
    expect(report).toContain("SEC-001");
  });
});
