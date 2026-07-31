import { describe, it, expect } from "vitest";
import { decide } from "../pipeline/stage3-decide.js";
import type { PreprocessedPR, ReviewResult } from "../../shared/types.js";

function mkPr(overrides: Record<string, unknown> = {}): PreprocessedPR {
  return {
    metadata: {
      id: "PR-001",
      number: 1,
      title: "test",
      author: "zjz",
      baseSha: "a",
      headSha: "b",
      createdAt: "2026-01-01",
      changedFiles: ["src/a.ts"],
      generatedFiles: [],
    },
    diffChunks: [],
    effectiveAddedLines: 10,
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

const dim = (name: string, score: number, severity: "reject" | "warning" | "suggestion" = "warning") => ({
  dimension: name,
  score,
  summary: name,
  findings: [{ file: "src/a.ts", line: 1, dimension: name, severity, summary: "x", detail: "y" }],
});

describe("decide", () => {
  it("passes clean PR with high scores", () => {
    const pr = mkPr();
    const review = mkReview({
      dimensionScores: [dim("correctness", 4), dim("readability", 4), dim("maintainability", 4), dim("evolvability", 4)],
    });

    const verdict = decide(pr, review);
    expect(verdict.decision).toBe("pass");
  });

  it("rejects when MCP hits reject severity", () => {
    const pr = mkPr({
      mcpResults: [{
        tool: "check_architecture",
        passed: false,
        hits: [{ id: "ARCH-001", severity: "reject", detail: "Controller 直连 DB" }],
        rawText: "x",
      }],
    });
    const review = mkReview({ dimensionScores: [dim("correctness", 5)] });

    const verdict = decide(pr, review);
    expect(verdict.decision).toBe("reject");
    expect(verdict.findings.some(f => f.ruleId === "ARCH-001")).toBe(true);
  });

  it("rejects when effectiveAddedLines exceeds 500 without generated files", () => {
    const pr = mkPr({ effectiveAddedLines: 501, hasGeneratedFiles: false });
    const review = mkReview({ dimensionScores: [dim("correctness", 4)] });

    const verdict = decide(pr, review);
    expect(verdict.decision).toBe("reject");
    expect(verdict.reason).toContain("500");
  });

  it("rejects when DeepSeek marks a finding as reject", () => {
    const pr = mkPr();
    const review = mkReview({
      dimensionScores: [dim("correctness", 2, "reject")],
    });

    const verdict = decide(pr, review);
    expect(verdict.decision).toBe("reject");
  });

  it("escalates when DeepSeek is uncertain", () => {
    const pr = mkPr();
    const review = mkReview({
      dimensionScores: [dim("correctness", 4)],
      uncertain: true,
      uncertainReason: "信息不足",
    });

    const verdict = decide(pr, review);
    expect(verdict.decision).toBe("escalate");
    expect(verdict.reason).toContain("不确定");
  });

  it("escalates when weighted score below pass threshold", () => {
    const pr = mkPr();
    // 加权 = 2*0.4 + 3*0.2 + 3*0.25 + 4*0.15 = 2.75，低于任何合理阈值
    const review = mkReview({
      dimensionScores: [
        dim("correctness", 2),
        dim("readability", 3),
        dim("maintainability", 3),
        dim("evolvability", 4),
      ],
    });

    const verdict = decide(pr, review);
    expect(verdict.decision).toBe("escalate");
    expect(verdict.reason).toMatch(/低于 \d+\.\d+/);
  });

  it("passes when weighted score exactly at threshold boundary", () => {
    const pr = mkPr();
    // 加权 = 4*0.4 + 3*0.2 + 4*0.25 + 3*0.15 = 1.6+0.6+1.0+0.45 = 3.65
    const review = mkReview({
      dimensionScores: [
        dim("correctness", 4),
        dim("readability", 3),
        dim("maintainability", 4),
        dim("evolvability", 3),
      ],
    });

    const verdict = decide(pr, review);
    expect(verdict.decision).toBe("pass");
  });

  it("exempts PRs where all chunks are generated", () => {
    const pr = mkPr({
      diffChunks: [{ file: "gen.ts", content: "", addedLines: 600, deletedLines: 0, isGenerated: true, isDoc: false, isLockfile: false }],
      effectiveAddedLines: 600,
      hasGeneratedFiles: true,
      metadata: { ...mkPr().metadata, generatedFiles: ["gen.ts"] },
    });
    const review = mkReview({ dimensionScores: [] });

    const verdict = decide(pr, review);
    expect(verdict.decision).toBe("pass");
  });

  it("collects MCP warning hits but does not reject on them alone", () => {
    const pr = mkPr({
      mcpResults: [{
        tool: "check_complexity",
        passed: true,
        hits: [{ id: "READ-001", severity: "warning", detail: "复杂度偏高" }],
        rawText: "x",
      }],
    });
    const review = mkReview({
      dimensionScores: [dim("correctness", 4), dim("readability", 4), dim("maintainability", 4), dim("evolvability", 4)],
    });

    const verdict = decide(pr, review);
    expect(verdict.decision).toBe("pass");
  });
});
