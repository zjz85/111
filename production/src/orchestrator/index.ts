import * as fs from "node:fs";
import * as path from "node:path";
import { fetchPR } from "./pipeline/stage1-fetch.js";
import { reviewPR } from "./pipeline/stage2-review.js";
import { decide } from "./pipeline/stage3-decide.js";
import { formatReport } from "./utils/report-formatter.js";
import { appendRecord, checkMisrateAlert } from "./utils/record-store.js";
import type { PreprocessedPR, ReviewResult, Verdict, DualModelRecord, DualModelTrigger, Decision } from "../shared/types.js";

const DATA_DIR = path.join(process.env.GITHUB_ACTIONS ? process.cwd() : "e:\\大作业\\pr自动初评机器人\\production", "data");
const RECORDS_FILE = path.join(DATA_DIR, "dual-model-records.json");

// 触发双审的敏感词
const SENSITIVE_KEYWORDS = ["金额", "支付", "退款", "认证", "密码", "password", "token", "密钥", "secret", "key"];

function hasBoundaryScore(review: ReviewResult): boolean {
  return review.dimensionScores.some(ds => ds.score === 3);
}

function hasSensitiveKeyword(text: string): boolean {
  return SENSITIVE_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
}

async function main(prId: string) {
  // ── Stage 1 ─────────────────────────────────
  console.log(`[Stage1] 读取 PR: ${prId}`);
  const pr = await fetchPR(prId);
  console.log(`  有效行数: ${pr.effectiveAddedLines}`);
  console.log(`  高风险: ${pr.highRiskHit ? pr.highRiskTypes.join(", ") : "无"}`);

  // ── MCP 直接打回：命中 reject 级别规则，跳过 AI 评审 ──
  const directRejectHits: Array<{ id: string; severity: string; detail: string; file?: string }> = [];
  for (const r of pr.mcpResults) {
    for (const h of r.hits) {
      if (h.severity === "reject") {
        directRejectHits.push(h);
      }
    }
  }

  // 有效行数 > 500 且非生成文件 → SCOPE-001 直接打回
  if (pr.effectiveAddedLines > 500 && !pr.hasGeneratedFiles) {
    directRejectHits.push({
      id: "SCOPE-001",
      severity: "reject",
      detail: `功能性 diff ${pr.effectiveAddedLines} 行超过 500 行阈值，应拆分为多个小型 PR。`,
    });
  }

  if (directRejectHits.length > 0) {
    console.log(`[MCP] ${directRejectHits.length} 条规则直接打回，跳过 AI 评审`);

    const rejectedDir = process.env.GITHUB_ACTIONS
      ? path.join(process.cwd(), "..", "..", "..", "rejected")
      : "e:\\大作业\\pr自动初评机器人\\rejected";
    fs.mkdirSync(rejectedDir, { recursive: true });
    const rejectedMd = generateRejectedMarkdown(pr, directRejectHits);
    const rejectedPath = path.join(rejectedDir, `${pr.metadata.id}.md`);
    fs.writeFileSync(rejectedPath, rejectedMd, "utf-8");
    console.log(`[Rejected] 打回记录已写入: ${rejectedPath}`);

    const directVerdict: Verdict = {
      prId: pr.metadata.id,
      decision: "reject",
      reason: directRejectHits.map(h => `${h.id}: ${h.detail}`).join("；"),
      findings: directRejectHits.map(h => ({
        file: h.file ?? "",
        line: 0,
        dimension: "correctness" as const,
        ruleId: h.id,
        severity: "reject" as const,
        summary: h.id,
        detail: h.detail,
      })),
      reportMarkdown: "",
    };

    const emptyReview = { prId: pr.metadata.id, dimensionScores: [], uncertain: false, summary: "MCP 直接打回，未进入 AI 评审" };
    const report = formatReport(pr, emptyReview, directVerdict);
    console.log("\n" + report);

    const reportPath = path.join(process.cwd(), "report.md");
    fs.writeFileSync(reportPath, report, "utf-8");
    console.log(`[Report] 报告已写入: ${reportPath}`);

    appendRecord({
      prId: pr.metadata.id,
      prNumber: pr.metadata.number,
      prTitle: pr.metadata.title,
      decision: "reject",
      weightedScore: 0,
      hitRules: directRejectHits.map(h => h.id),
      highRiskHit: pr.highRiskHit,
      dualModelUsed: false,
      humanOverridden: false,
      timestamp: new Date().toISOString(),
    });

    return { pr, primaryReview: emptyReview, verdict: directVerdict, report, dualRecord: null };
  }

  // ── 高风险 → 生成 Codex-reviewer 输入文件 ──
  if (pr.highRiskHit) {
    const codexDir = path.join(process.cwd(), "..", "..", "..", "multi-model-log");
    fs.mkdirSync(codexDir, { recursive: true });
    const diffText = pr.diffChunks.map(c => c.content).join("\n\n");
    const codexContent = `---
name: Codex-reviewer 复审请求
trigger: ${pr.highRiskTypes.join("、")}
pr: ${pr.metadata.id}
---

## PR Diff

${diffText}

## 触发原因

高风险代码扫描命中了：${pr.highRiskTypes.join("、")}

## 任务

请作为 Codex-reviewer，对以上 Diff 做正确性深度检查：

| 类别 | 找什么 |
|---|---|
| SQL 注入 | 用户输入直接拼到 SQL 查询里 |
| 空指针 / 未定义 | 没检查 null/undefined 就直接用 |
| 逻辑错误 | 条件写反、循环不对、返回值错 |
| 竞态条件 | 并发读写共享变量 |
| 边界情况 | 空数组、0、空字符串、超大值 |
| 语法错误 | 少括号、引用不存在的变量 |
| 异常处理 | try-catch 吞错误 |

## 输出格式

| 定位 | 问题 | 规范引用 | 危害说明 | 严重等级 |
|---|---|---|---|---|
| \`[文件，行]\` | 说明 | 规范ID | 危害 | 打回/建议 |

## Codex 报告回存位置

评审完成后，将结果 Markdown 保存到：\`${codexDir}/${pr.metadata.id}-codex-review-report.md\`
`;

    const codexFile = path.join(codexDir, `${pr.metadata.id}-codex-review.md`);
    fs.writeFileSync(codexFile, codexContent, "utf-8");
    console.log(`[Codex-reviewer] 复审文件已生成: ${codexFile}`);
  }

  // ── Stage 2: 主审 (deepseek-chat) ───────────
  console.log("[Stage2] 主审 (deepseek-chat) 评审中...");
  const primaryReview = await reviewPR(pr, "deepseek-chat");
  console.log(`  加权总分: ${calcWeighted(primaryReview)}`);

  // ── Stage 3: 判定 ───────────────────────────
  const primaryVerdict = decide(pr, primaryReview);

  // ── 判断是否需要双审 ────────────────────────
  const allText = pr.diffChunks.map(c => c.content).join(" ") + pr.prDescription + pr.metadata.title;
  let trigger: DualModelTrigger | null = null;

  if (hasSensitiveKeyword(allText)) {
    trigger = "sensitive_keyword";
  } else if (hasBoundaryScore(primaryReview)) {
    trigger = "boundary_score";
  } else if (primaryReview.uncertain) {
    trigger = "uncertain_flag";
  }

  let finalVerdict = primaryVerdict;
  let dualRecord: DualModelRecord | null = null;

  if (trigger) {
    console.log(`[DualModel] 触发双审（${trigger}），调 deepseek-reasoner 复审...`);
    const secondaryReview = await reviewPR(pr, "deepseek-reasoner");
    const secondaryVerdict = decide(pr, secondaryReview);
    const consistent = primaryVerdict.decision === secondaryVerdict.decision;

    console.log(`  主审: ${primaryVerdict.decision} | 复审: ${secondaryVerdict.decision} | ${consistent ? "一致" : "不一致"}`);

    dualRecord = {
      prId: pr.metadata.id,
      triggeredBy: trigger,
      primaryModel: "deepseek-chat",
      primaryDecision: primaryVerdict.decision,
      primaryScores: primaryReview.dimensionScores.map(ds => ({ dimension: ds.dimension, score: ds.score })),
      secondaryModel: "deepseek-reasoner",
      secondaryDecision: secondaryVerdict.decision,
      secondaryScores: secondaryReview.dimensionScores.map(ds => ({ dimension: ds.dimension, score: ds.score })),
      consistent,
      finalDecision: consistent ? primaryVerdict.decision : "escalate",
      timestamp: new Date().toISOString(),
    };

    saveDualModelRecord(dualRecord);

    // 双审时也生成 Codex-reviewer 文件，方便人工拿给第三方 AI 交叉验证
    const codexDir = path.join(process.cwd(), "..", "..", "..", "multi-model-log");
    fs.mkdirSync(codexDir, { recursive: true });
    const diffText = pr.diffChunks.map(c => c.content).join("\n\n");
    const codexContent = `---
name: Codex-reviewer 双审复核
trigger: ${trigger}
pr: ${pr.metadata.id}
primaryModel: deepseek-chat (${primaryVerdict.decision})
secondaryModel: deepseek-reasoner (${secondaryVerdict.decision})
consistent: ${consistent}
---

## PR Diff

${diffText}

## 双审结果

| 模型 | 判定 | 正确性 | 可读性 | 可维护性 | 可演进性 |
|---|---|---|---|---|---|
| deepseek-chat (主审) | ${primaryVerdict.decision} | ${primaryReview.dimensionScores.find(ds => ds.dimension === "correctness")?.score ?? "-"} | ${primaryReview.dimensionScores.find(ds => ds.dimension === "readability")?.score ?? "-"} | ${primaryReview.dimensionScores.find(ds => ds.dimension === "maintainability")?.score ?? "-"} | ${primaryReview.dimensionScores.find(ds => ds.dimension === "evolvability")?.score ?? "-"} |
| deepseek-reasoner (复审) | ${secondaryVerdict.decision} | ${secondaryReview.dimensionScores.find(ds => ds.dimension === "correctness")?.score ?? "-"} | ${secondaryReview.dimensionScores.find(ds => ds.dimension === "readability")?.score ?? "-"} | ${secondaryReview.dimensionScores.find(ds => ds.dimension === "maintainability")?.score ?? "-"} | ${secondaryReview.dimensionScores.find(ds => ds.dimension === "evolvability")?.score ?? "-"} |

## 主审发现

${primaryReview.dimensionScores.flatMap(ds => ds.findings).map(f => `- **${f.severity}** [${f.dimension}] \`[${f.file}${f.line ? ":" + f.line : ""}]\`: ${f.summary}`).join("\n") || "无"}

## 复审发现

${secondaryReview.dimensionScores.flatMap(ds => ds.findings).map(f => `- **${f.severity}** [${f.dimension}] \`[${f.file}${f.line ? ":" + f.line : ""}]\`: ${f.summary}`).join("\n") || "无"}

## 任务

请作为 Codex-reviewer，对以上 Diff 做正确性深度检查，特别关注两个模型结论${consistent ? "一致" : "不一致"}的情况：

| 类别 | 找什么 |
|---|---|
| SQL 注入 | 用户输入直接拼到 SQL 查询里 |
| 空指针 / 未定义 | 没检查 null/undefined 就直接用 |
| 逻辑错误 | 条件写反、循环不对、返回值错 |
| 竞态条件 | 并发读写共享变量 |
| 边界情况 | 空数组、0、空字符串、超大值 |
| 语法错误 | 少括号、引用不存在的变量 |
| 异常处理 | try-catch 吞错误 |

## 输出格式

| 定位 | 问题 | 规范引用 | 危害说明 | 严重等级 |
|---|---|---|---|---|
| \`[文件，行]\` | 说明 | 规范ID | 危害 | 打回/建议 |

## Codex 报告回存位置

评审完成后，将结果 Markdown 保存到：\`${codexDir}/${pr.metadata.id}-codex-review-report.md\`
`;
    const codexFile = path.join(codexDir, `${pr.metadata.id}-codex-review.md`);
    fs.writeFileSync(codexFile, codexContent, "utf-8");
    console.log(`[DualModel] Codex-reviewer 双审复核文件已生成: ${codexFile}`);

    if (!consistent) {
      finalVerdict = {
        ...primaryVerdict,
        decision: "escalate",
        reason: `双模型结论不一致（主审: ${primaryVerdict.decision}，复审: ${secondaryVerdict.decision}），转人工判断`,
      };
    }
  }

  console.log(`[Stage3] 最终判定: ${finalVerdict.decision}`);

  // ── 写评审全量记录 ──────────────────────────────
  const hitRules: string[] = [];
  for (const r of pr.mcpResults) {
    for (const h of r.hits) {
      hitRules.push(h.id);
    }
  }
  if (pr.effectiveAddedLines > 500 && !pr.hasGeneratedFiles) {
    hitRules.push("SCOPE-001");
  }
  for (const ds of primaryReview.dimensionScores) {
    for (const f of ds.findings) {
      if (f.ruleId && f.severity === "reject") {
        if (!hitRules.includes(f.ruleId)) hitRules.push(f.ruleId);
      }
    }
  }

  appendRecord({
    prId: pr.metadata.id,
    prNumber: pr.metadata.number,
    prTitle: pr.metadata.title,
    decision: finalVerdict.decision,
    weightedScore: parseFloat(calcWeighted(primaryReview)),
    hitRules,
    highRiskHit: pr.highRiskHit,
    dualModelUsed: trigger !== null,
    humanOverridden: false,
    timestamp: new Date().toISOString(),
  });

  // ── 误判率告警 ────────────────────────
  const alert = checkMisrateAlert();
  if (alert) {
    console.error(alert);
  }

  // ── 输出报告 ──────────────────────────────────
  const report = formatReport(pr, primaryReview, finalVerdict);
  console.log("\n" + report);

  // 写报告文件，供 CI 贴评论用
  const reportPath = path.join(process.cwd(), "report.md");
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`[Report] 报告已写入: ${reportPath}`);

  if (dualRecord) {
    console.log(`[DualModel] 双审记录已保存: ${RECORDS_FILE}`);
  }

  return { pr, primaryReview, verdict: finalVerdict, report, dualRecord };
}

function generateRejectedMarkdown(
  pr: PreprocessedPR,
  hits: Array<{ id: string; severity: string; detail: string; file?: string }>,
): string {
  const m = pr.metadata;
  const lines: string[] = [];

  lines.push(`# ${m.id} 打回记录`);
  lines.push("");
  lines.push("| 项目 | 值 |");
  lines.push("|---|---|");
  lines.push(`| PR ID | ${m.id} |`);
  lines.push(`| 标题 | ${m.title} |`);
  lines.push(`| 作者 | ${m.author} |`);
  lines.push(`| 变更文件 | ${m.changedFiles.length}（${m.changedFiles.join("、")}） |`);
  lines.push(`| 新增行数 | ${pr.effectiveAddedLines} |`);
  lines.push(`| 拒绝原因 | ${hits.map(h => h.id).join("、")} |`);
  lines.push("");

  lines.push("## 违规项");
  lines.push("");
  lines.push("| 定位 | 问题 | 规范ID |");
  lines.push("|---|---|---|");
  for (const h of hits) {
    const loc = h.file ? `\`[${h.file}]\`` : "—";
    lines.push(`| ${loc} | ${h.detail} | ${h.id} |`);
  }
  lines.push("");

  lines.push("## 改进建议");
  lines.push("");

  for (const h of hits) {
    if (h.id === "ARCH-001") {
      lines.push(`- **${h.id}**: 将数据库访问逻辑下沉到 application service 层，Controller 只负责请求路由和参数校验`);
    } else if (h.id === "SCOPE-001") {
      lines.push(`- **${h.id}**: 将 PR 拆分为多个小 PR，每个控制在 500 行以内`);
    } else {
      lines.push(`- **${h.id}**: 请根据规范要求修改`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

function calcWeighted(review: { dimensionScores: Array<{ dimension: string; score: number }> }): string {
  const weights: Record<string, number> = {
    correctness: 0.40, readability: 0.20, maintainability: 0.25, evolvability: 0.15,
  };
  const total = review.dimensionScores.reduce((sum, ds) => sum + ds.score * (weights[ds.dimension] ?? 0.25), 0);
  return total.toFixed(2);
}

function saveDualModelRecord(record: DualModelRecord): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const existing: DualModelRecord[] = [];
  if (fs.existsSync(RECORDS_FILE)) {
    try {
      const raw = fs.readFileSync(RECORDS_FILE, "utf-8");
      existing.push(...JSON.parse(raw));
    } catch { /* file empty or corrupt, start fresh */ }
  }
  existing.push(record);
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(existing, null, 2), "utf-8");
}

// ── CLI 入口 ──────────────────────────────────────
const prId = process.argv[2];
if (!prId) {
  console.error("用法: node index.ts <pr-id>");
  console.error("示例: node index.ts pr-001");
  process.exit(1);
}

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("请设置环境变量 DEEPSEEK_API_KEY");
  process.exit(1);
}

main(prId).catch(err => {
  console.error("评审失败:", err);
  process.exit(1);
});
