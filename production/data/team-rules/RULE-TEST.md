<!-- version: 1 -->
# 测试策略

## RULE-TEST-001

新增或修改业务行为必须包含正常、异常、边界测试。
## RULE-TEST-002

删除测试必须在 PR 描述中说明替代覆盖，否则打回。
## RULE-TEST-003

禁止固定 sleep；使用条件等待或 fake clock。
