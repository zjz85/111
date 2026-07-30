---
name: Codex-reviewer 复审报告
trigger: db_operation
pr: PR-002
reviewer: Codex (GPT-5)
review_time: 2026-07-30
---

## 复审结果

| 定位 | 问题 | 规范引用 | 危害说明 | 严重等级 |
|---|---|---|---|---|
| `src/controllers/user.ts:1` | 缺少 `PrismaClient` 的 import 语句 | JS-IMPORT-001 | 运行时抛出 `ReferenceError: PrismaClient is not defined`，请求直接崩溃，服务不可用 | **打回** |
| `src/controllers/user.ts:2` | `findUnique` 返回 Promise，但函数未标记 `async` 且未使用 `.then()` / `await` | JS-ASYNC-001 | 调用方收到的不是用户数据而是 Promise 对象，Express 无法序列化，接口返回异常响应 | **打回** |
| `src/controllers/user.ts:1` | 每请求都执行 `new PrismaClient()`，违反 Prisma 官方单例最佳实践 | PRISMA-LIFECYCLE-001 | 大量连接无法释放导致连接池耗尽，生产环境几分钟内 DB 连接数打满，服务雪崩 | **打回** |
| `src/controllers/user.ts:2` | 绕过 `userService.get()` 直接操作数据库 | ARCH-LAYER-001 | 跳过原有的权限校验、数据脱敏、缓存、审计日志等业务逻辑，可能造成越权或数据泄露 | **打回** |
| `src/controllers/user.ts:2` | `findUnique` 返回 `null` 时未做守卫处理 | JS-NULL-001 | 用户不存在时直接返回 `null`，客户端收到 200 + `null` 而非标准的 404，上游调用方可能报空指针异常 | **建议** |

## 逐项分析

### 1. SQL 注入 — ✅ 安全
Prisma 的 `findUnique` 使用参数化查询引擎，`req.params.id` 作为查询值传入而非拼接到 SQL 字符串中，不存在 SQL 注入风险。

### 2. 空指针 / 未定义 — ⚠️ 有 1 个问题
`req.params.id` 在 Express 路由参数未匹配时为 `undefined`，Prisma 会返回 `null` 而非报错；但**致命问题**是 `PrismaClient` 压根没有被引入，会导致 ReferenceError。

### 3. 逻辑错误 — ❌ 3 个严重问题
- **缺少 `import`**：`PrismaClient` 来自 `@prisma/client` 包，diff 中没有添加 import 语句。这是语法级错误，代码根本无法运行。
- **缺少 `async`/Promise 处理**：`db.user.findUnique()` 返回 `Promise<User | null>`。在 Express 中，同步函数返回的 Promise 不会被自动 await，Express 会尝试序列化 Promise 对象，结果通常是空响应或 `{}`。
- **连接池设计错误**：`new PrismaClient()` 应在应用初始化时单例实例化，或在依赖注入容器中管理。每请求都实例化是 Prisma 官方明确警告的反模式。

### 4. 架构破坏
原代码依赖 `userService.get()` 抽象层。即使 `userService` 内部只是对 Prisma 的简单包装，直接绕过也意味着：
- 未来在 service 层添加缓存、审计、权限逻辑时，该 controller 不会受益
- 违背了分层架构的依赖方向（controller → service → data access）

## 结论

**结论：打回。** 该 PR 存在 4 个**必须修复**的硬伤：

1. 补全 `import { PrismaClient } from '@prisma/client'`
2. 将路由处理器标记为 `async`，使用 `await db.user.findUnique(...)`
3. 将 `PrismaClient` 提取为模块级或应用级单例
4. 回归 `userService.get()` 调用，把 Prisma 逻辑保留在 service 层

建议开发者在明确需要绕过 service 层的情形下，也先经架构评审再做此类变更。
