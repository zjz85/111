import { describe, it, expect, vi, beforeEach } from "vitest";

// mock node:fs 避免真实写盘
const fsState: Record<string, string> = {};
vi.mock("node:fs", () => ({
  default: {
    writeFileSync: vi.fn((p: string, content: string) => { fsState[p] = content; }),
    mkdirSync: vi.fn(),
  },
  writeFileSync: vi.fn((p: string, content: string) => { fsState[p] = content; }),
  mkdirSync: vi.fn(),
}));

// mock record-store 的 appendRecord / checkMisrateAlert
const recordStoreState: { records: unknown[]; alert: string | null } = { records: [], alert: null };
vi.mock("../../orchestrator/utils/record-store.js", () => ({
  appendRecord: vi.fn((r: unknown) => { recordStoreState.records.push(r); }),
  checkMisrateAlert: vi.fn(() => recordStoreState.alert),
}));

import { writeReviewRecord, writeRejectedIfReject, writeMisrateAlertIfAny, repoRoot } from "../utils/artifacts.js";

describe("artifacts", () => {
  beforeEach(() => {
    for (const k of Object.keys(fsState)) delete fsState[k];
    recordStoreState.records = [];
    recordStoreState.alert = null;
  });

  describe("writeReviewRecord", () => {
    it("appends record with timestamp", () => {
      writeReviewRecord({
        prId: "PR-001",
        prNumber: 1,
        prTitle: "x",
        decision: "pass",
        weightedScore: 4,
        hitRules: [],
        highRiskHit: false,
        dualModelUsed: false,
        humanOverridden: false,
      });
      expect(recordStoreState.records).toHaveLength(1);
      const r = recordStoreState.records[0] as { timestamp: string };
      expect(r.timestamp).toBeDefined();
    });
  });

  describe("writeRejectedIfReject", () => {
    it("writes rejected file when isReject true", () => {
      writeRejectedIfReject("PR-001", "report body", true);
      const written = Object.entries(fsState).find(([k]) => k.includes("PR-001"));
      expect(written).toBeDefined();
      expect(written![1]).toBe("report body");
    });

    it("does not write when isReject false", () => {
      writeRejectedIfReject("PR-001", "report body", false);
      const written = Object.entries(fsState).find(([k]) => k.includes("PR-001"));
      expect(written).toBeUndefined();
    });
  });

  describe("writeMisrateAlertIfAny", () => {
    it("writes alert file when checkMisrateAlert returns non-null", () => {
      recordStoreState.alert = "⚠️ 误判率告警";
      writeMisrateAlertIfAny();
      expect(fsState["misrate-alert.txt"]).toBe("⚠️ 误判率告警");
    });

    it("does not write when no alert", () => {
      recordStoreState.alert = null;
      writeMisrateAlertIfAny();
      expect(fsState["misrate-alert.txt"]).toBeUndefined();
    });
  });

  describe("repoRoot", () => {
    it("returns workspace path in CI", () => {
      const old = process.env.GITHUB_ACTIONS;
      process.env.GITHUB_ACTIONS = "true";
      process.env.GITHUB_WORKSPACE = "/tmp/ws";
      expect(repoRoot()).toBe("/tmp/ws");
      if (old === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = old;
    });
  });
});
