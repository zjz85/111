<!-- version: 1 -->
# 架构边界

## RULE-ARCH-001

Controller 不得直接访问数据库；必须调用 application service。
## RULE-ARCH-002

领域层不得依赖 Web 框架或 ORM。
