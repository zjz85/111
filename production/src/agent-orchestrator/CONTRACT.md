# agent-orchestrator 接口契约

## 模块概览

| 模块 | 路径 | 职责 |
|---|---|---|
| 编排入口 | `index.ts` | CLI 入口，编排 实施→评审→决策 三阶段 Agent 流水线 |
| Agent 循环 | `utils/agent-loop.ts` | 通用 Anthropic SDK tool-use 循环 |
| PR 预处理 | `tools/analyze-pr.ts` | 抓取 PR、diff 分片、MCP 规范检查、高风险扫描 |
| 实施 Agent | `agents/implementer.ts` | 调 analyze_pr 工具输出 PreprocessedPR |
| 评审 Agent | `agents/reviewer.ts` | 四维评审（正确性/可读性/可维护性/可演进性） |
| 决策 Agent | `agents/decider.ts` | 综合判定 pass/reject/escalate + 写报告 |
| Codex 复审 | `agents/codex-reviewer.ts` | 高风险代码 7 类正确性深度检查 |
| MCP 包装 | `agents/mcp-reviewer-tools.ts` | query_rule 工具包装 |
| 报告/记录 | `utils/artifacts.ts` | 报告/评审记录/打回记录/误判告警写入 |
| 元信息提取 | `utils/pr-meta.ts` | PreprocessedPR JSON 审计字段提取 |
| 快速通道 | `utils/scope-fastpath.ts` | SCOPE-001 有效行数超限快速打回 |

---

## 1. 编排入口（index.ts）

### 职责边界
- **核心职责：** CLI 入口，按序编排三阶段 Agent，输出最终评审产物
- **不做什么：** 不包含业务判定逻辑（判定在决策 Agent）；不直接调 MCP（在 analyze-pr）；不生成报告内容（在决策 Agent/scope-fastpath）

### 接口签名
```
npx tsx index.ts <pr-id>
```

### 输入参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| pr-id | string | 是 | PR 编号，支持 11 / pr-001 / PR-001 |

### 输出结构（产物文件）
| 文件 | 说明 |
|---|---|
| `report.md` | 评审报告正文 |
| `review-records.json`（追加） | 评审记录（误判率监控数据源） |
| `rejected/{PR-ID}.md` | 仅 reject 时写打回记录 |
| `misrate-alert.txt` | 仅误判率超阈值时写告警 |

### 异常语义
| 错误码 | 场景 | 触发条件 |
|---|---|---|
| exit 1 | 参数非法 | 未传 pr-id |
| exit 1 | 编排失败 | Agent 调用异常冒泡 |

---

## 2. Agent 循环（utils/agent-loop.ts）

### 职责边界
- **核心职责：** 给定 system prompt + 工具定义 + 初始消息，跑 tool-use 循环直到 end_turn
- **不做什么：** 不含任何业务逻辑；不含评审/判定

### 接口签名
```
runAgent(config: AgentConfig, toolExecutor: ToolExecutor, initialMessage: string) => Promise<{ text: string; toolCalls: ToolCall[] }>
```

### 输入参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| config.model | string | 是 | 模型名 |
| config.systemPrompt | string | 是 | 系统提示 |
| config.tools | Tool[] | 是 | 工具定义 |
| config.maxTokens | number | 否 | 最大输出 token，默认 4096 |
| config.temperature | number | 否 | 采样温度，默认 0.1 |
| toolExecutor | ToolExecutor | 是 | 工具执行器映射 |
| initialMessage | string | 是 | 初始用户消息 |

### 输出结构
```json
{
  "text": "模型最终文本输出",
  "toolCalls": [{ "name": "tool_name", "input": {}, "output": "..." }]
}
```

### 异常语义
- 工具执行失败不中断循环，以 `Error: ...` 字符串返回给模型
- 超过 MAX_TURNS（10）返回 `[Agent loop exceeded max turns]`
- 未知工具返回 `Error: unknown tool "<name>"`

---

## 3. PR 预处理（tools/analyze-pr.ts）

### 职责边界
- **核心职责：** 抓取 PR 并生成 PreprocessedPR（diff 分片、MCP 检查、高风险扫描）
- **不做什么：** 不做评审/判定；不生成报告

### 接口签名
```
analyzePr(prId: string) => Promise<PreprocessedPR>
```

### 输入参数
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| prId | string | 是 | PR 编号；CI 模式为数字，本地为样例目录名/绝对路径 |

### 输出结构
`PreprocessedPR`（定义见 `../shared/types.ts`）：metadata、diffChunks、effectiveAddedLines、hasGeneratedFiles、mcpResults、highRiskHit、highRiskTypes、prDescription、hasFlagChange

### 异常语义
| 错误 | 场景 | 处理 |
|---|---|---|
| MCP 检查失败 | server 未启动/超时 | 降级为 `mcp_error` 结果，不中断 |
| CI 模式无 PR number | prId 非数字 | throw，编排终止 |

---

## 4. 实施 Agent（agents/implementer.ts）

- **核心职责：** 接收 PR 编号 → 调 `analyze_pr` 工具 → 原样输出 PreprocessedPR JSON
- **不做什么：** 不评审、不判定、不修改工具输出
- **工具：** `analyze_pr(prId: string) => PreprocessedPR JSON`

## 5. 评审 Agent（agents/reviewer.ts）

- **核心职责：** 四维评审（正确性/可读性/可维护性/可演进性），输出 JSON 评分
- **不做什么：** 不做最终判定
- **工具：** `query_rule(keyword, rule_id?)` 检索团队规范
- **输出：** ReviewResult JSON（scores/uncertain/summary）

## 6. 决策 Agent（agents/decider.ts）

- **核心职责：** 综合 PreprocessedPR + ReviewResult 做最终判定（pass/reject/escalate），生成报告
- **工具：** `codex_review(prId, highRiskTypes, prDescription, diffContent)`、`read_records()`
- **判定规则：** MCP 直接打回 / 加权分 <3.0 / uncertain→escalate / highRiskHit→codex_review
- **副产品：** codex_review 将复审报告落盘 `multi-model-log/{prId}-codex-review-report.md`（去重后）

## 7. Codex 复审（agents/codex-reviewer.ts）

- **核心职责：** 高风险代码 7 类正确性检查（SQL 注入/空指针/逻辑错误/竞态条件/边界情况/语法错误/异常处理）
- **无工具**，纯分析 Agent
- **接口：** `buildCodexInput(diffText, prDescription, highRiskTypes) => string`

## 8. MCP 包装（agents/mcp-reviewer-tools.ts）

- **核心职责：** 封装 MCP server 的 query_rule 调用
- **不做什么：** 只暴露 query_rule，不暴露其它 MCP 工具
- **接口：** `queryRule(input: { keyword, rule_id? }) => Promise<string>`

---

## 9. 报告/记录写入（utils/artifacts.ts）

| 函数 | 签名 | 说明 |
|---|---|---|
| repoRoot | `() => string` | 仓库根目录（CI/本地自适应） |
| rejectedDir | `() => string` | rejected/ 目录路径 |
| writeReport | `(body: string) => void` | 写 report.md |
| writeReviewRecord | `(record) => void` | 追加评审记录 |
| writeMisrateAlertIfAny | `() => void` | 误判率超阈值写告警 |
| writeRejectedIfReject | `(prId, body, isReject) => void` | 仅 reject 写打回记录 |

## 10. 元信息提取（utils/pr-meta.ts）

- **核心职责：** 从 PreprocessedPR JSON 提取审计字段（title/highRiskHit/highRiskTypes）
- **接口：** `extractPrMeta(prText: string) => PrMeta`
- **容错：** 解析失败返回 fallback（不抛异常）

## 11. 快速通道（utils/scope-fastpath.ts）

- **核心职责：** SCOPE-001 有效行数超 500 快速打回
- **接口：** `shouldFastReject(prText) => { hit, effectiveAddedLines }`、`buildScopeReport(prId, lines) => string`
- **常量：** `SCOPE_THRESHOLD = 500`

---

## 验收检查项

- ✅ **正确性：** 三阶段编排主路径符合契约，MCP/Agent 失败有降级
- ✅ **可读性：** 模块职责单一，命名与契约术语一致
- ✅ **可维护性：** index.ts 已拆分为编排 + 工具模块，无重复逻辑
- ✅ **可演进性：** agent-loop 通用可复用，Agent 可独立扩展
