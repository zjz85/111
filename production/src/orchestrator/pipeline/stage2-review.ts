import * as fs from "node:fs";
import * as path from "node:path";
import OpenAI from "openai";
import type { PreprocessedPR, ReviewResult, ReviewFinding, DimensionScore } from "../../shared/types.js";

const PROMPT_PATH = path.resolve(process.cwd(), "..", "skills", "review-prompt.md");

const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
});

/**
 * Stage2: 拼 prompt + diff → 调 DeepSeek API → 解析 JSON
 * @param model DeepSeek 模型名，默认 deepseek-chat
 */
export async function reviewPR(pr: PreprocessedPR, model = "deepseek-chat"): Promise<ReviewResult> {
  // ── 1. 拼 prompt ──────────────────────────────
  const template = fs.readFileSync(PROMPT_PATH, "utf-8");

  const scaleResult = pr.effectiveAddedLines > 500
    ? `❌ 拒绝：有效代码 ${pr.effectiveAddedLines} 行，超过 500 行阈值`
    : `✅ 通过：有效代码 ${pr.effectiveAddedLines} 行`;

  const mcpSection = pr.mcpResults
    .map(r => `${r.tool}: ${r.rawText}`)
    .join("\n");

  const totalHits = pr.mcpResults.reduce((sum, r) => sum + r.hits.length, 0);

  const highRiskSection = pr.highRiskHit
    ? `命中（${pr.highRiskTypes.join("、")}），Codex-reviewer 专项报告：无`
    : `未命中，Codex-reviewer 专项报告：无`;

  const filledPrompt = template
    .replace("{effectiveLines}", String(pr.effectiveAddedLines))
    .replace("{通过 / 拒绝}", scaleResult)
    .replace("{以下由程序逐条填写 MCP 检查结果}", mcpSection)
    .replace("{N}", String(totalHits))
    .replace("{命中 / 未命中}", highRiskSection);

  const diffText = pr.diffChunks.map(c => c.content).join("\n\n");

  const descriptionSection = pr.prDescription
    ? `\n\n## PR 描述（作者提交）\n\n${pr.prDescription}`
    : "";

  const flagWarning = pr.hasFlagChange
    ? `\n\n**注意：本次变更涉及 feature flag 配置文件，必须检查以下规范（FLAG-001）：**
1. 是否声明了 flag owner？
2. 是否说明了 rollout 计划？
3. 是否说明了回滚方案？
如缺少以上信息，必须在"可演进性"维度打回（score ≤ 2），ruleId 引用 FLAG-001。`
    : "";

  const fullPrompt = `${filledPrompt}${descriptionSection}${flagWarning}\n\n---\n\n## PR Diff\n\n${diffText}`;

  // ── 2. 调 DeepSeek API ────────────────────────
  const response = await deepseek.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "你是一个专业的代码评审助手。只返回 JSON，不要其他内容。" },
      { role: "user", content: fullPrompt },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  });

  const rawText = response.choices[0]?.message?.content ?? "";

  // ── 3. 解析 JSON ──────────────────────────────
  let parsed: {
    scores?: Array<{
      dimension: string;
      score: number;
      summary: string;
      findings: Array<{
        file: string;
        line: number;
        severity: string;
        ruleId?: string;
        summary: string;
        detail: string;
      }>;
    }>;
    uncertain?: boolean;
    uncertain_reason?: string;
    summary?: string;
  };
  try {
    const jsonStr = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      prId: pr.metadata.id,
      dimensionScores: [],
      uncertain: true,
      uncertainReason: `无法解析 DeepSeek 响应为 JSON。原始响应：\n${rawText.slice(0, 500)}`,
      summary: "解析失败",
    };
  }

  // ── 4. 转成 ReviewResult ──────────────────────
  const dimensionScores: DimensionScore[] = (parsed.scores ?? []).map(s => ({
    dimension: s.dimension as DimensionScore["dimension"],
    score: s.score,
    summary: s.summary,
    findings: (s.findings ?? []).map(f => ({
      file: f.file,
      line: f.line,
      dimension: s.dimension as ReviewFinding["dimension"],
      ruleId: f.ruleId,
      severity: (f.severity as ReviewFinding["severity"]) ?? "suggestion",
      summary: f.summary,
      detail: f.detail,
    })),
  }));

  return {
    prId: pr.metadata.id,
    dimensionScores,
    uncertain: parsed.uncertain ?? false,
    uncertainReason: parsed.uncertain_reason,
    summary: parsed.summary ?? "",
  };
}
