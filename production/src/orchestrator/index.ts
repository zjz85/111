import * as fs from "node:fs";
import * as path from "node:path";
import { fetchPR } from "./pipeline/stage1-fetch.js";
import { reviewPR } from "./pipeline/stage2-review.js";
import { decide } from "./pipeline/stage3-decide.js";
import { formatReport } from "./utils/report-formatter.js";
import { appendRecord, checkMisrateAlert } from "./utils/record-store.js";
import type { ReviewResult, Verdict, DualModelRecord, DualModelTrigger, Decision } from "../shared/types.js";

const DATA_DIR = path.join(process.env.CI ? process.cwd() : "e:\\大作业\\pr自动初评机器人\\production", "data");
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
