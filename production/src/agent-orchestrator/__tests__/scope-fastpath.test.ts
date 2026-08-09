import { describe, it, expect } from "vitest";
import { SCOPE_THRESHOLD, extractEffectiveAddedLines, buildScopeReport, shouldFastReject } from "../utils/scope-fastpath.js";

describe("extractEffectiveAddedLines", () => {
  it("extracts effectiveAddedLines from JSON", () => {
    const text = JSON.stringify({ effectiveAddedLines: 560, metadata: { title: "x" } });
    expect(extractEffectiveAddedLines(text)).toBe(560);
  });

  it("returns null when field missing", () => {
    expect(extractEffectiveAddedLines('{"metadata":{}}')).toBeNull();
  });

  it("returns null on non-numeric", () => {
    expect(extractEffectiveAddedLines('{"effectiveAddedLines":"abc"}')).toBeNull();
  });
});

describe("shouldFastReject", () => {
  it("hits when lines exceed threshold", () => {
    const text = JSON.stringify({ effectiveAddedLines: SCOPE_THRESHOLD + 1 });
    const r = shouldFastReject(text);
    expect(r.hit).toBe(true);
    expect(r.effectiveAddedLines).toBe(SCOPE_THRESHOLD + 1);
  });

  it("does not hit at exactly threshold", () => {
    const text = JSON.stringify({ effectiveAddedLines: SCOPE_THRESHOLD });
    const r = shouldFastReject(text);
    expect(r.hit).toBe(false);
  });

  it("does not hit when below threshold", () => {
    const text = JSON.stringify({ effectiveAddedLines: 100 });
    const r = shouldFastReject(text);
    expect(r.hit).toBe(false);
  });

  it("does not hit when unparsable", () => {
    const r = shouldFastReject("no json here");
    expect(r.hit).toBe(false);
    expect(r.effectiveAddedLines).toBeNull();
  });
});

describe("buildScopeReport", () => {
  it("generates report with threshold and effective lines", () => {
    const report = buildScopeReport("PR-001", 560);
    expect(report).toContain("PR-001");
    expect(report).toContain("560");
    expect(report).toContain("SCOPE-001");
    expect(report).toContain("❌ 打回");
    expect(report).toContain(`${SCOPE_THRESHOLD}`);
    expect(report).toContain("拆分");
  });
});
