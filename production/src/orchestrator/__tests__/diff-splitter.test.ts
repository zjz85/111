import { describe, it, expect } from "vitest";
import { splitDiff, splitLargeChunks, effectiveAddedLines } from "../utils/diff-splitter.js";

describe("splitDiff", () => {
  it("splits a single-file diff into one chunk", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 123..456 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,1 +1,2 @@",
      "+const x = 1;",
      " function y() {}",
    ].join("\n");

    const chunks = splitDiff(diff);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].file).toBe("src/a.ts");
    expect(chunks[0].addedLines).toBe(1);
    expect(chunks[0].deletedLines).toBe(0);
    expect(chunks[0].isGenerated).toBe(false);
    expect(chunks[0].isDoc).toBe(false);
    expect(chunks[0].isLockfile).toBe(false);
  });

  it("splits a multi-file diff into multiple chunks", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1,1 @@",
      "+export const a = 1;",
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1 +1,1 @@",
      "+export const b = 2;",
    ].join("\n");

    const chunks = splitDiff(diff);
    expect(chunks).toHaveLength(2);
    expect(chunks.map(c => c.file)).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("classifies generated files by pattern", () => {
    const diff = [
      "diff --git a/src/api.generated.ts b/src/api.generated.ts",
      "--- a/src/api.generated.ts",
      "+++ b/src/api.generated.ts",
      "@@ -0,0 +1,1 @@",
      "+export const generated = true;",
    ].join("\n");

    const chunks = splitDiff(diff);
    expect(chunks[0].isGenerated).toBe(true);
  });

  it("classifies doc files by .md extension", () => {
    const diff = [
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1 +1,2 @@",
      "+# 新增文档内容",
    ].join("\n");

    const chunks = splitDiff(diff);
    expect(chunks[0].isDoc).toBe(true);
  });

  it("classifies lockfiles by package-lock.json", () => {
    const diff = [
      "diff --git a/package-lock.json b/package-lock.json",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1 +1,2 @@",
      "+  \"lockfileVersion\": 3",
    ].join("\n");

    const chunks = splitDiff(diff);
    expect(chunks[0].isLockfile).toBe(true);
  });

  it("classifies explicitly-tagged generated files", () => {
    const diff = [
      "diff --git a/src/normal.ts b/src/normal.ts",
      "--- a/src/normal.ts",
      "+++ b/src/normal.ts",
      "@@ -1 +1,2 @@",
      "+export const x = 1;",
    ].join("\n");

    const chunks = splitDiff(diff, ["src/normal.ts"]);
    expect(chunks[0].isGenerated).toBe(true);
  });

  it("ignores lines without diff --git header", () => {
    const diff = "some random text\nno header here";
    const chunks = splitDiff(diff);
    expect(chunks).toHaveLength(0);
  });

  it("does not count +++ as an added line", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1,2 @@",
      "+const x = 1;",
      "+const y = 2;",
    ].join("\n");

    const chunks = splitDiff(diff);
    expect(chunks[0].addedLines).toBe(2);
  });
});

describe("effectiveAddedLines", () => {
  const mkChunk = (overrides: Record<string, unknown>) => ({
    file: "a.ts",
    content: "",
    addedLines: 10,
    deletedLines: 0,
    isGenerated: false,
    isDoc: false,
    isLockfile: false,
    ...overrides,
  });

  it("sums added lines across chunks", () => {
    const chunks = [mkChunk({ addedLines: 10 }), mkChunk({ addedLines: 5 })];
    expect(effectiveAddedLines(chunks)).toBe(15);
  });

  it("excludes generated, doc, and lockfile chunks", () => {
    const chunks = [
      mkChunk({ addedLines: 10 }),
      mkChunk({ addedLines: 20, isGenerated: true }),
      mkChunk({ addedLines: 30, isDoc: true }),
      mkChunk({ addedLines: 40, isLockfile: true }),
    ];
    expect(effectiveAddedLines(chunks)).toBe(10);
  });
});

describe("splitLargeChunks", () => {
  it("leaves small chunks untouched", () => {
    const chunk = {
      file: "a.ts",
      content: "diff --git a/a.ts b/a.ts\n@@ -1 +1,1 @@\n+const x = 1;",
      addedLines: 1,
      deletedLines: 0,
      isGenerated: false,
      isDoc: false,
      isLockfile: false,
    };
    const result = splitLargeChunks([chunk], 300);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(chunk);
  });

  it("splits large non-generated chunks by hunk", () => {
    const lines1 = Array.from({ length: 160 }, (_, i) => `+const v${i} = ${i};`);
    const lines2 = Array.from({ length: 160 }, (_, i) => `+const w${i} = ${i};`);
    const large = {
      file: "big.ts",
      content: [
        "diff --git a/big.ts b/big.ts",
        "@@ -1,200 +1,320 @@",
        ...lines1,
        "@@ -200,320 +320,480 @@",
        ...lines2,
      ].join("\n"),
      addedLines: 320,
      deletedLines: 0,
      isGenerated: false,
      isDoc: false,
      isLockfile: false,
    };

    const result = splitLargeChunks([large], 300);
    expect(result.length).toBeGreaterThan(1);
    expect(result.every(c => c.addedLines <= 300)).toBe(true);
  });

  it("does not split generated large chunks", () => {
    const large = {
      file: "gen.ts",
      content: "diff --git a/gen.ts b/gen.ts\n@@ -1,1000 +1,1000 @@\n+".repeat(500),
      addedLines: 500,
      deletedLines: 0,
      isGenerated: true,
      isDoc: false,
      isLockfile: false,
    };

    const result = splitLargeChunks([large], 300);
    expect(result).toHaveLength(1);
  });
});
