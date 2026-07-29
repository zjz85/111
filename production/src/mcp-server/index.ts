/**
 * PR 自动初评机器人 — MCP Server
 *
 * 暴露团队规范文档（6 份规则文件 + 项目设计文档）供 AI 评审时查阅。
 * 传输方式: stdio（Claude Code 直接连接，无需网络端口）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod/v4";
import { loadAllRules, readRuleFileRaw } from "./utils/rule-parser.js";

// ─── 路径常量 ───────────────────────────────────────────

const DOCS_DIR = (() => {
  if (process.env.GITHUB_WORKSPACE) return path.join(process.env.GITHUB_WORKSPACE, "docs");
  return "e:\\大作业\\pr自动初评机器人\\docs";
})();

// ─── 创建 MCP Server ────────────────────────────────────

const server = new McpServer({
  name: "pr-review-rules",
  version: "1.0.0",
});

// ═══════════════════════════════════════════════════════════
// Resources: 暴露规范文档
// ═══════════════════════════════════════════════════════════

const ruleFiles: Array<{ uri: string; name: string; file: string }> = [
  { uri: "rule://api",      name: "接口演进规则",      file: "RULE-API.md" },
  { uri: "rule://arch",     name: "架构边界规则",      file: "RULE-ARCH.md" },
  { uri: "rule://deps",     name: "依赖治理规则",      file: "RULE-DEPS.md" },
  { uri: "rule://scope",    name: "变更规模规则",      file: "RULE-SCOPE.md" },
  { uri: "rule://security", name: "安全隐私规则",      file: "RULE-SECURITY.md" },
  { uri: "rule://test",     name: "测试策略规则",      file: "RULE-TEST.md" },
];

for (const { uri, name, file } of ruleFiles) {
  server.registerResource(
    name,
    uri,
    { description: `团队规范: ${name}（来源: ${file}）`, mimeType: "text/markdown" },
    async (uriObj: URL) => {
      const content = readRuleFileRaw(file);
      return {
        contents: [{ uri: uriObj.href, mimeType: "text/markdown", text: content }],
      };
    }
  );
}

// --- 全部规则汇总 ---

server.registerResource(
  "全部规则汇总",
  "rule://all",
  { description: "全部 15 条团队规则汇总，按分类组织", mimeType: "text/markdown" },
  async (uriObj: URL) => {
    const rules = loadAllRules();
    const byCategory = new Map<string, typeof rules>();
    for (const r of rules) {
      const list = byCategory.get(r.category) || [];
      list.push(r);
      byCategory.set(r.category, list);
    }

    let text = "# 团队规范规则汇总\n\n";
    for (const [category, items] of byCategory) {
      text += `## ${category}\n\n`;
      for (const item of items) {
        text += `### ${item.id}\n\n${item.content}\n\n`;
      }
    }

    return {
      contents: [{ uri: uriObj.href, mimeType: "text/markdown", text }],
    };
  }
);

// --- 项目设计文档 ---

server.registerResource(
  "项目设计文档",
  "docs://design",
  { description: "项目设计文档（复杂度预算 + 接口契约 + 双区切换）", mimeType: "text/markdown" },
  async (uriObj: URL) => {
    const files = ["复杂性预算说明.md", "接口契约.md", "双区切换决策.md"];
    let text = "";
    for (const file of files) {
      const filePath = path.join(DOCS_DIR, file);
      if (fs.existsSync(filePath)) {
        text += fs.readFileSync(filePath, "utf-8") + "\n\n---\n\n";
      }
    }

    return {
      contents: [{ uri: uriObj.href, mimeType: "text/markdown", text }],
    };
  }
);

// ═══════════════════════════════════════════════════════════
// Tools: 规则查询与检查
// ═══════════════════════════════════════════════════════════

const ALL_RULES = loadAllRules();

// --- Tool 1: query_rule ---

server.registerTool(
  "query_rule",
  {
    description: "按关键字或规则 ID（如 ARCH-001）在全部团队规范中检索匹配的规则条款",
    inputSchema: {
      keyword: z.string().describe("检索关键字，如 'Controller'、'依赖'、'sleep'"),
      rule_id: z.string().optional().describe("可选：按规则 ID 精确查询，如 'ARCH-001'"),
    },
  },
  async (args) => {
    const { keyword, rule_id } = args;
    const kw = keyword.toLowerCase();

    const matches = rule_id
      ? ALL_RULES.filter(r => r.id.toLowerCase() === rule_id.toLowerCase())
      : ALL_RULES.filter(r =>
          r.id.toLowerCase().includes(kw) ||
          r.content.toLowerCase().includes(kw) ||
          r.category.toLowerCase().includes(kw)
        );

    if (matches.length === 0) {
      return {
        content: [{ type: "text", text: `未找到匹配 "${keyword}" 的规则。` }],
      };
    }

    const result = matches.map(r =>
      `**${r.id}** (${r.category}, ${r.sourceFile})\n> ${r.content.replace(/\n/g, "\n> ")}`
    ).join("\n\n---\n\n");

    return {
      content: [{ type: "text", text: `找到 ${matches.length} 条匹配规则:\n\n${result}` }],
    };
  }
);

// --- Tool 2: check_complexity ---

server.registerTool(
  "check_complexity",
  {
    description: "检查 PR 是否命中 SCOPE-001（>500行拆分）、SCOPE-002（单一目标）、READ-001（认知复杂度>15）",
    inputSchema: {
      added_lines: z.number().describe("新增行数（排除生成文件和锁文件）"),
      deleted_lines: z.number().optional().describe("删除行数"),
      changed_files: z.number().optional().describe("变更文件数"),
      has_generated_files: z.boolean().optional().describe("是否包含标记为生成的代码文件"),
      pr_description: z.string().optional().describe("PR 描述内容"),
    },
  },
  async (args) => {
    const { added_lines, changed_files, has_generated_files, pr_description } = args;
    const hits: Array<{ id: string; severity: "reject" | "warning"; detail: string }> = [];

    if (has_generated_files) {
      hits.push({
        id: "SCOPE-001",
        severity: "warning",
        detail: `PR 包含 ${added_lines} 行变更，但标记了生成文件——已从统计中排除。请人工确认生成文件比例是否合理。`,
      });
    } else if (added_lines > 500) {
      hits.push({
        id: "SCOPE-001",
        severity: "reject",
        detail: `功能性 diff ${added_lines} 行超过 500 行阈值，应拆分为多个 PR。`,
      });
    }

    if (pr_description && (changed_files ?? 0) > 5) {
      const goals = (pr_description.match(/[，,；;。\n]/g) || []).length;
      if (goals > 2) {
        hits.push({
          id: "SCOPE-002",
          severity: "warning",
          detail: `PR 涉及 ${changed_files} 个文件，描述中疑似包含多个目标。`,
        });
      }
    }

    if (added_lines > 200 && (changed_files ?? 10) < 3) {
      hits.push({
        id: "READ-001",
        severity: "warning",
        detail: `单文件超过 ${added_lines} 行新增，建议检查函数认知复杂度是否超过 15。`,
      });
    }

    if (hits.length === 0) {
      return { content: [{ type: "text", text: "✅ 通过: 未命中规模/复杂度规则。" }] };
    }

    const text = hits.map(h =>
      `- **[${h.severity === "reject" ? "🔴 拒绝" : "⚠️ 预警"}] ${h.id}**: ${h.detail}`
    ).join("\n");

    return { content: [{ type: "text", text: `命中 ${hits.length} 条规则:\n${text}` }] };
  }
);

// --- Tool 3: check_architecture ---

server.registerTool(
  "check_architecture",
  {
    description: "检查变更文件是否违反 ARCH-001（Controller 不得直连 DB）和 ARCH-002（领域层不得依赖 Web/ORM）",
    inputSchema: {
      changed_files: z.array(z.string()).describe("变更文件路径列表"),
      diff_content: z.string().optional().describe("代码 diff 内容，用于检测跨层调用模式"),
    },
  },
  async (args) => {
    const { changed_files, diff_content } = args;
    const hits: Array<{ id: string; file: string; detail: string }> = [];

    for (const file of changed_files) {
      const lower = file.toLowerCase();
      if (lower.includes("controller") && diff_content) {
        const hasDirectDB = /\bnew\s+(DatabaseClient|MongoClient|mysql|pg|sequelize|prisma|PrismaClient)\b/i.test(diff_content) ||
          /\b(connection|pool|query|execute)\s*\(/i.test(diff_content);
        if (hasDirectDB) {
          hits.push({ id: "ARCH-001", file, detail: `Controller 疑似直接访问数据库，必须调用 application service。` });
        }
      }
      if ((lower.includes("domain") || lower.includes("entity")) && diff_content) {
        if (/\b(express|koa|fastify|typeorm|sequelize|prisma)\b/i.test(diff_content)) {
          hits.push({ id: "ARCH-002", file, detail: `领域层引用了 Web 框架或 ORM，领域层不得依赖框架。` });
        }
      }
    }

    if (hits.length === 0) {
      return { content: [{ type: "text", text: "✅ 通过: 未检测到架构边界违规。" }] };
    }

    const text = hits.map(h => `- **🔴 ${h.id}** [${h.file}]: ${h.detail}`).join("\n");
    return { content: [{ type: "text", text: `命中 ${hits.length} 条架构规则:\n${text}` }] };
  }
);

// --- Tool 4: check_dependency ---

server.registerTool(
  "check_dependency",
  {
    description: "检查新增依赖是否符合 DEPS-001（说明用途/许可证/体积/替代方案）和 DEPS-002（锁文件同步）",
    inputSchema: {
      package_name: z.string().describe("新增的包名"),
      license_declared: z.boolean().optional().describe("是否已声明许可证"),
      rationale_provided: z.boolean().optional().describe("是否已说明引入必要性"),
      alternatives_discussed: z.boolean().optional().describe("是否已讨论替代方案"),
      lockfile_updated: z.boolean().optional().describe("锁文件是否同步更新"),
    },
  },
  async (args) => {
    const { package_name, license_declared, rationale_provided, alternatives_discussed, lockfile_updated } = args;
    const misses: string[] = [];

    if (!license_declared) misses.push("未声明许可证类型");
    if (!rationale_provided) misses.push("未说明引入必要性");
    if (!alternatives_discussed) misses.push("未讨论替代方案");
    if (lockfile_updated === false) misses.push("锁文件未同步更新");

    if (misses.length === 0) {
      return { content: [{ type: "text", text: `✅ 通过: 依赖 "${package_name}" 信息完整。` }] };
    }

    return {
      content: [{
        type: "text",
        text: `🔴 **DEPS-001/DEPS-002** 未通过: "${package_name}" 缺少:\n${misses.map(m => `- ${m}`).join("\n")}`,
      }],
    };
  }
);

// --- Tool 5: check_security ---

server.registerTool(
  "check_security",
  {
    description: "检查代码 diff 是否违反 SEC-001（不得记录敏感信息）和 SEC-002（外部输入验证、错误不返回堆栈）",
    inputSchema: {
      diff_content: z.string().describe("代码 diff 全文"),
    },
  },
  async (args) => {
    const { diff_content } = args;
    const hits: Array<{ id: string; detail: string }> = [];

    const patterns: Array<{ regex: RegExp; desc: string }> = [
      { regex: /\b(password|passwd|pwd|secret)\s*[:=]\s*['"]/gi, desc: "疑似硬编码密码" },
      { regex: /\b(token|api_key|apikey|access_key)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}/gi, desc: "疑似硬编码 token/key" },
      { regex: /console\.(log|warn|error)\([^)]*\b(email|password|token|payment|credit)\b/gi, desc: "日志输出包含敏感字段" },
      { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, desc: "代码含完整邮箱地址" },
    ];

    for (const { regex, desc } of patterns) {
      if (regex.test(diff_content)) {
        hits.push({ id: "SEC-001", detail: `${desc}。禁止记录密码/token/完整邮箱/支付信息。` });
      }
    }

    if (/\b(req\.body|req\.query|req\.params)\b/.test(diff_content) &&
        !/\b(validate|zod|joi|yup|schema|check)\b/i.test(diff_content)) {
      hits.push({ id: "SEC-002", detail: "检测到外部输入但未发现验证逻辑。外部输入必须验证。" });
    }

    if (/\bstack\b.*\b(res\.(json|send)|response)/i.test(diff_content) ||
        /\b(error\.stack|err\.stack|e\.stack)\b/.test(diff_content)) {
      hits.push({ id: "SEC-002", detail: "错误响应中包含堆栈信息。禁止向客户端返回堆栈。" });
    }

    if (hits.length === 0) {
      return { content: [{ type: "text", text: "✅ 通过: 未检测到安全/隐私违规。" }] };
    }

    const text = hits.map(h => `- **🔴 ${h.id}**: ${h.detail}`).join("\n");
    return { content: [{ type: "text", text: `命中 ${hits.length} 条安全规则:\n${text}` }] };
  }
);

// ═══════════════════════════════════════════════════════════
// 启动
// ═══════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ MCP Server 'pr-review-rules' 已启动 (stdio)");
}

main().catch((err: unknown) => {
  console.error("❌ MCP Server 启动失败:", err);
  process.exit(1);
});
