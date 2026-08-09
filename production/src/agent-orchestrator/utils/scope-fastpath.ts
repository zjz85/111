/**
 * SCOPE-001 快速通道 — 有效行数超阈值直接打回并要求拆分
 */
export const SCOPE_THRESHOLD = 500;

/**
 * 从 PreprocessedPR JSON 中解析有效行数
 * @returns 有效行数；解析失败返回 null
 */
export function extractEffectiveAddedLines(prText: string): number | null {
  const m = prText.match(/\{[^]*?"effectiveAddedLines"\s*:\s*(\d+)[^]*\}/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/**
 * 生成 SCOPE-001 快速打回报告
 */
export function buildScopeReport(prId: string, effectiveAddedLines: number): string {
  const threshold = SCOPE_THRESHOLD;
  return [
    `# PR 自动初审报告 — ${prId}（有效行数超限）`,
    ``,
    `| 元信息 | 值 |`,
    `|---|---|`,
    `| PR 编号 | ${prId} |`,
    `| 判定 | ❌ 打回 |`,
    `| 触发规则 | SCOPE-001 |`,
    `| 有效行数 | ${effectiveAddedLines}（阈值 ${threshold}） |`,
    ``,
    `## 规范检查`,
    ``,
    `| 检查项 | 结果 | 说明 |`,
    `|---|---|---|`,
    `| check_complexity | ❌ 拒绝 | SCOPE-001：有效行数 ${effectiveAddedLines} 超过 ${threshold} 行阈值，应拆分为多个小型 PR |`,
    ``,
    `## 最终判定`,
    ``,
    `**❌ 打回**：有效行数 ${effectiveAddedLines} 超过 ${threshold} 行阈值（SCOPE-001），要求拆分。`,
    ``,
    `## 拆分要求`,
    ``,
    `- 将本次变更拆分为多个小型 PR，每个 PR 有效行数控制在 ${threshold} 行以内`,
    `- 按功能模块分组提交，避免一次性堆叠大量代码`,
    `- 拆分后逐个提交评审，验证每个小 PR 通过后再合并`,
    ``,
    `*报告生成时间：${new Date().toISOString()} | 评审引擎：SCOPE-001 快速通道*`,
  ].join("\n");
}

/**
 * 判断是否命中 SCOPE-001 快速通道（有效行数超阈值）
 */
export function shouldFastReject(prText: string): { hit: boolean; effectiveAddedLines: number | null } {
  const effectiveAddedLines = extractEffectiveAddedLines(prText);
  if (effectiveAddedLines === null) return { hit: false, effectiveAddedLines: null };
  return { hit: effectiveAddedLines > SCOPE_THRESHOLD, effectiveAddedLines };
}
