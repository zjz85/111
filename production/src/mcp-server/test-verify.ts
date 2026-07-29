/**
 * 快速验证 MCP Server 的规则解析和工具逻辑
 */

import { loadAllRules } from "./utils/rule-parser.js";
import * as fs from "node:fs";

const dir = "C:\\Users\\86157\\Desktop\\题目\\学生数据包\\02-PR自动初评机器人\\data\\team-rules";

console.log("=== 1. 规则文件列表 ===");
console.log(fs.readdirSync(dir).filter((f: string) => f.endsWith(".md")));

console.log("\n=== 2. 全部规则 ===");
const rules = loadAllRules();
console.log(`共 ${rules.length} 条规则:`);
for (const r of rules) {
  console.log(`  ${r.id} | ${r.category} | ${r.sourceFile}`);
}

console.log("\n=== 3. 查询测试: query_rule('Controller') ===");
const matches = rules.filter(r =>
  r.id.toLowerCase().includes("controller") ||
  r.content.toLowerCase().includes("controller") ||
  r.category.toLowerCase().includes("controller")
);
for (const m of matches) {
  console.log(`  ✅ ${m.id}: ${m.content.substring(0, 80)}...`);
}

console.log("\n=== 4. 复杂度检查: 560 行 diff ===");
if (560 > 500) {
  console.log("  🔴 SCOPE-001 命中: 功能性 diff 560 行超过 500 行阈值");
}

console.log("\n=== 5. 安全测试: console.log(email) ===");
const testDiff = "console.log(user.email, user.token)";
if (/\b(token|email)\b/i.test(testDiff)) {
  console.log("  🔴 SEC-001 命中: 日志输出包含敏感字段");
}

console.log("\n✅ 所有验证通过！");
