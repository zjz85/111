---
name: Codex-reviewer 复审请求
trigger: db_operation
pr: PR-002
---

## PR Diff

diff --git a/src/controllers/user.ts b/src/controllers/user.ts
--- a/src/controllers/user.ts
+++ b/src/controllers/user.ts
@@ -1,1 +1,2 @@
-return userService.get(req.params.id)
+const db = new PrismaClient()
+return db.user.findUnique({ where: { id: req.params.id } })

## 触发原因

高风险代码扫描命中了：db_operation

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
| `[文件，行]` | 说明 | 规范ID | 危害 | 打回/建议 |

## Codex 报告回存位置

评审完成后，将结果 Markdown 保存到：`E:\大作业\pr自动初评机器人\multi-model-log/PR-002-codex-review-report.md`
