import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseRuleFile, loadAllRules, getFileVersion } from "../utils/rule-parser.js";

// 用真实规则目录
const REAL_RULES = path.resolve(__dirname, "..", "..", "..", "data", "team-rules");

describe("parseRuleFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rule-parser-"));
  });

  const writeRule = (content: string) => {
    const file = path.join(dir, "RULE-TEST.md");
    fs.writeFileSync(file, content, "utf-8");
    return file;
  };

  it("parses category and rules from markdown", () => {
    const file = writeRule(`# 测试规则

## RULE-T-001

规则一内容。

## RULE-T-002

规则二内容。
`);
    const { category, rules } = parseRuleFile(file);
    expect(category).toBe("测试规则");
    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe("RULE-T-001");
    expect(rules[0].content).toContain("规则一内容");
    expect(rules[0].version).toBe(1);
    expect(rules[0].sourceFile).toBe("RULE-TEST.md");
  });

  it("parses category even when version comment is on first line", () => {
    // 真实规则文件格式：第一行是 version 注释，第二行才是 # 标题
    const file = writeRule(`<!-- version: 2 -->
# 测试规则

## RULE-T-001

规则一内容。
`);
    const { category, rules } = parseRuleFile(file);
    expect(category).toBe("测试规则");
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("RULE-T-001");
    expect(rules[0].version).toBe(2);
  });

  it("defaults version to 1 when no header comment", () => {
    const file = writeRule(`# 测试规则

## RULE-T-001

内容。
`);
    const { rules } = parseRuleFile(file);
    expect(rules[0].version).toBe(1);
  });

  it("returns empty rules for file with no RULE- headers", () => {
    const file = writeRule(`# 只有标题

没有规则。
`);
    const { rules } = parseRuleFile(file);
    expect(rules).toHaveLength(0);
  });

  it("handles multi-line rule content", () => {
    const file = writeRule(`# 测试规则

## RULE-T-001

第一行。
第二行。

第三行（空行后）。
`);
    const { rules } = parseRuleFile(file);
    expect(rules).toHaveLength(1);
    expect(rules[0].content).toContain("第一行");
    expect(rules[0].content).toContain("第二行");
  });

  it("records correct line number of rule start", () => {
    const file = writeRule(`# 测试规则

## RULE-T-001

内容。
`);
    const { rules } = parseRuleFile(file);
    // 行号从 0 开始计，RULE-T-001 在第 3 行
    expect(rules[0].lineNumber).toBe(3);
  });
});

describe("loadAllRules", () => {
  it("loads all rule files with category", () => {
    const rules = loadAllRules();
    expect(rules.length).toBeGreaterThan(0);
    // category 修复后，真实规则文件能解析出非空分类
    const categories = new Set(rules.map(r => r.category));
    expect(categories.size).toBeGreaterThan(0);
  });

  it("loads all rules with version 1", () => {
    const rules = loadAllRules();
    const versions = new Set(rules.map(r => r.version));
    expect(versions).toEqual(new Set([1]));
  });
});

describe("getFileVersion", () => {
  it("returns version from real rule file", () => {
    expect(getFileVersion("RULE-TEST.md")).toBe(1);
  });

  it("returns 1 for missing file", () => {
    expect(getFileVersion("NONEXISTENT.md")).toBe(1);
  });
});
