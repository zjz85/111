import { describe, it, expect, vi, beforeEach } from "vitest";

// mock node:fs 避免读写真实 review-records.json
const fsState = {
  exists: false,
  content: "",
};

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => fsState.exists),
    readFileSync: vi.fn(() => fsState.content),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((_p: string, content: string) => {
      fsState.content = content;
      fsState.exists = true;
    }),
  },
  existsSync: vi.fn(() => fsState.exists),
  readFileSync: vi.fn(() => fsState.content),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((_p: string, content: string) => {
    fsState.content = content;
    fsState.exists = true;
  }),
}));

import { loadRecords, appendRecord, markOverridden, calcMisrate, checkMisrateAlert } from "../utils/record-store.js";
import type { ReviewRecord } from "../../shared/types.js";

function mkRecord(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    prId: "PR-001",
    prNumber: 1,
    prTitle: "test",
    decision: "pass",
    weightedScore: 4,
    hitRules: [],
    highRiskHit: false,
    dualModelUsed: false,
    humanOverridden: false,
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("record-store", () => {
  beforeEach(() => {
    fsState.exists = false;
    fsState.content = "";
  });

  describe("loadRecords", () => {
    it("returns empty array when file does not exist", () => {
      expect(loadRecords()).toEqual([]);
    });

    it("returns parsed records when file exists", () => {
      fsState.exists = true;
      fsState.content = JSON.stringify([mkRecord()]);
      const records = loadRecords();
      expect(records).toHaveLength(1);
      expect(records[0].prId).toBe("PR-001");
    });

    it("returns empty array on JSON parse error", () => {
      fsState.exists = true;
      fsState.content = "not valid json";
      expect(loadRecords()).toEqual([]);
    });
  });

  describe("appendRecord", () => {
    it("appends a record and writes back", () => {
      appendRecord(mkRecord());
      const saved = JSON.parse(fsState.content);
      expect(saved).toHaveLength(1);
    });

    it("preserves existing records when appending", () => {
      fsState.exists = true;
      fsState.content = JSON.stringify([mkRecord({ prId: "PR-001" })]);
      appendRecord(mkRecord({ prId: "PR-002" }));
      const saved = JSON.parse(fsState.content);
      expect(saved).toHaveLength(2);
    });
  });

  describe("markOverridden", () => {
    it("sets humanOverridden to true for matching PR", () => {
      fsState.exists = true;
      fsState.content = JSON.stringify([mkRecord({ prId: "PR-001" })]);
      markOverridden("PR-001");
      const saved = JSON.parse(fsState.content);
      expect(saved[0].humanOverridden).toBe(true);
    });

    it("does not write file when PR not found", () => {
      fsState.exists = true;
      fsState.content = JSON.stringify([mkRecord({ prId: "PR-001" })]);
      const original = fsState.content;
      markOverridden("PR-999");
      expect(fsState.content).toBe(original);
    });
  });

  describe("calcMisrate", () => {
    it("returns zero when no records", () => {
      fsState.exists = true;
      fsState.content = "[]";
      expect(calcMisrate()).toEqual({ rate: 0, totalRejected: 0, overridden: 0 });
    });

    it("calculates rate as overridden / rejected", () => {
      fsState.exists = true;
      fsState.content = JSON.stringify([
        mkRecord({ prId: "PR-1", decision: "reject", humanOverridden: true }),
        mkRecord({ prId: "PR-2", decision: "reject", humanOverridden: false }),
        mkRecord({ prId: "PR-3", decision: "pass" }),
      ]);
      const result = calcMisrate();
      expect(result.totalRejected).toBe(2);
      expect(result.overridden).toBe(1);
      expect(result.rate).toBe(0.5);
    });
  });

  describe("checkMisrateAlert", () => {
    it("returns null when few rejects", () => {
      fsState.exists = true;
      fsState.content = JSON.stringify([
        mkRecord({ prId: "PR-1", decision: "reject", humanOverridden: true }),
      ]);
      // totalRejected=1 < 5, 不告警
      expect(checkMisrateAlert()).toBeNull();
    });

    it("returns alert when misrate above threshold", () => {
      const records: ReviewRecord[] = [];
      for (let i = 0; i < 6; i++) {
        records.push(mkRecord({ prId: `PR-${i}`, decision: "reject", humanOverridden: i < 4 }));
      }
      fsState.exists = true;
      fsState.content = JSON.stringify(records);
      // 4/6 = 66.7% > 15%
      const alert = checkMisrateAlert();
      expect(alert).not.toBeNull();
      expect(alert).toContain("误判率告警");
    });

    it("returns null when misrate below threshold", () => {
      const records: ReviewRecord[] = [];
      for (let i = 0; i < 20; i++) {
        records.push(mkRecord({ prId: `PR-${i}`, decision: "reject", humanOverridden: i === 0 }));
      }
      fsState.exists = true;
      fsState.content = JSON.stringify(records);
      // 1/20 = 5% < 15%
      expect(checkMisrateAlert()).toBeNull();
    });
  });
});
