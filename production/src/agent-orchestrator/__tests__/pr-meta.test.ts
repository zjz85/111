import { describe, it, expect } from "vitest";
import { extractPrMeta } from "../utils/pr-meta.js";

describe("extractPrMeta", () => {
  it("extracts title, highRiskHit, highRiskTypes from JSON", () => {
    const text = JSON.stringify({
      metadata: { title: "Add validation" },
      highRiskHit: true,
      highRiskTypes: ["db_operation", "core_interface"],
    });
    const meta = extractPrMeta(text);
    expect(meta.prTitle).toBe("Add validation");
    expect(meta.highRiskHit).toBe(true);
    expect(meta.highRiskTypes).toEqual(["db_operation", "core_interface"]);
  });

  it("returns fallback on unparsable text", () => {
    const meta = extractPrMeta("not json");
    expect(meta.prTitle).toBe("PR 自动初审");
    expect(meta.highRiskHit).toBe(false);
    expect(meta.highRiskTypes).toEqual([]);
  });

  it("handles highRiskHit false", () => {
    const text = JSON.stringify({ highRiskHit: false, metadata: { title: "x" } });
    const meta = extractPrMeta(text);
    expect(meta.highRiskHit).toBe(false);
  });

  it("handles empty highRiskTypes", () => {
    const text = JSON.stringify({ highRiskTypes: [], metadata: { title: "x" } });
    const meta = extractPrMeta(text);
    expect(meta.highRiskTypes).toEqual([]);
  });

  it("falls back title when metadata missing", () => {
    const text = JSON.stringify({ highRiskHit: true });
    const meta = extractPrMeta(text);
    expect(meta.prTitle).toBe("PR 自动初审");
    expect(meta.highRiskHit).toBe(true);
  });
});
