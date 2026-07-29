/**
 * 规则文件读取与解析工具
 * 从 Markdown 格式的团队规范文件中提取结构化规则数据
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** 规则源文件的基础路径 */
function resolveRulesBasePath(): string {
  // 优先级1: 环境变量 RULES_DIR
  if (process.env.RULES_DIR) return process.env.RULES_DIR;
  // 优先级2: 尝试当前目录逐级往上找 production/data/team-rules
  const candidates = [
    process.env.GITHUB_WORKSPACE && path.join(process.env.GITHUB_WORKSPACE, "production", "data", "team-rules"),
    path.join(process.cwd(), "..", "..", "..", "production", "data", "team-rules"),
    path.join(process.cwd(), "..", "..", "data", "team-rules"),
    path.join(process.cwd(), "production", "data", "team-rules"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  // 优先级3: 本地开发路径
  return "C:\\Users\\86157\\Desktop\\题目\\学生数据包\\02-PR自动初评机器人\\data\\team-rules";
}
const RULES_BASE_PATH = resolveRulesBasePath();

/** 单条规则 */
export interface Rule {
  id: string;
  category: string;
  content: string;
  sourceFile: string;
  lineNumber: number;
  version: number;
}

/** 解析文件头版本号注释 */
function parseFileVersion(lines: string[], filePath: string): number {
  const firstLine = lines[0] ?? "";
  const match = firstLine.match(/<!--\s*version:\s*(\d+)\s*-->/);
  if (match) return parseInt(match[1], 10);
  // 没有版本号注释的默认为 v1
  return 1;
}

/** 获取文件的实际版本（从内容中识别或从文件名推测） */
export function getFileVersion(fileName: string): number {
  const filePath = path.join(RULES_BASE_PATH, fileName);
  if (!fs.existsSync(filePath)) return 1;
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  return parseFileVersion(lines, filePath);
}

/**
 * 解析单个规则 Markdown 文件
 */
export function parseRuleFile(filePath: string): { category: string; rules: Rule[] } {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const fileName = path.basename(filePath);

  let category = "";
  const rules: Rule[] = [];
  let currentRuleId = "";
  let currentRuleLines: string[] = [];
  let currentRuleStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (line.startsWith("# ") && i === 0) {
      category = line.replace(/^# /, "").trim();
      continue;
    }

    // 跳过文件头顶的 version 注释行
    if (line.trim().startsWith("<!--") || line.trim().endsWith("-->")) {
      // 只跳过第 1-3 行的注释行
      if (i <= 3) continue;
    }

    if (/^## RULE-/.test(line)) {
      if (currentRuleId && currentRuleLines.length > 0) {
        rules.push({
          id: currentRuleId,
          category,
          content: currentRuleLines.join("\n").trim(),
          sourceFile: fileName,
          lineNumber: currentRuleStartLine,
          version: parseFileVersion(lines, filePath),
        });
      }
      currentRuleId = line.replace(/^## /, "").trim();
      currentRuleLines = [];
      currentRuleStartLine = i + 1;
      continue;
    }

    if (currentRuleId && line.trim().length > 0) {
      currentRuleLines.push(line);
    }
  }

  if (currentRuleId && currentRuleLines.length > 0) {
    rules.push({
      id: currentRuleId,
      category,
      content: currentRuleLines.join("\n").trim(),
      sourceFile: fileName,
      lineNumber: currentRuleStartLine,
      version: parseFileVersion(lines, filePath),
    });
  }

  return { category, rules };
}

/** 按版本号加载规则 */
export function loadAllRules(version?: number): Rule[] {
  const allRules: Rule[] = [];
  const files = fs.readdirSync(RULES_BASE_PATH).filter((f: string) => f.endsWith(".md"));

  for (const file of files) {
    const { rules } = parseRuleFile(path.join(RULES_BASE_PATH, file));
    if (version) {
      allRules.push(...rules.filter(r => r.version === version));
    } else {
      allRules.push(...rules);
    }
  }

  return allRules;
}

/** 读取单个规则文件的原始内容 */
export function readRuleFileRaw(fileName: string): string {
  const filePath = path.join(RULES_BASE_PATH, fileName);
  return fs.readFileSync(filePath, "utf-8");
}

/** 获取所有规则文件的文件名列表 */
export function listRuleFiles(): string[] {
  return fs.readdirSync(RULES_BASE_PATH).filter((f: string) => f.endsWith(".md"));
}
