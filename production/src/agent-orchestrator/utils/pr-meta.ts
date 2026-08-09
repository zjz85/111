/**
 * PR 元信息提取 — 从实施 Agent 输出的 PreprocessedPR JSON 提取审计字段
 */
export interface PrMeta {
  prTitle: string;
  highRiskHit: boolean;
  highRiskTypes: string[];
}

const FALLBACK: PrMeta = { prTitle: "PR 自动初审", highRiskHit: false, highRiskTypes: [] };

/**
 * 从实施 Agent 输出的 PreprocessedPR JSON 中提取审计字段
 * 避免 appendRecord 硬编码 prTitle / highRiskHit 导致记录失真
 */
export function extractPrMeta(prText: string): PrMeta {
  try {
    const titleM = prText.match(/"title"\s*:\s*"([^"]*)"/);
    const hitM = prText.match(/"highRiskHit"\s*:\s*(true|false)/);
    const typesM = prText.match(/"highRiskTypes"\s*:\s*(\[[\s\S]*?\])/);
    return {
      prTitle: titleM?.[1] ?? FALLBACK.prTitle,
      highRiskHit: hitM?.[1] === "true" ? true : hitM?.[1] === "false" ? false : FALLBACK.highRiskHit,
      highRiskTypes: typesM ? JSON.parse(typesM[1]).map(String) : FALLBACK.highRiskTypes,
    };
  } catch {
    return FALLBACK;
  }
}
