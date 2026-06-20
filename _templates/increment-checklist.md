---
title: <增量名> 开发清单
status: active
last_reviewed: <YYYY-MM-DD>
---

# 开发清单：<增量名>

> 对照全局流程 4.8 逐项打勾。⛔ 是闸门，不过不许进下一步。

## A 选题
- [ ] A1 最小垂直切片；依赖少→多；底座优先

## B 出方案（过闸才动手）
- [ ] B1 proposal：终态 / 范围 / 不做 / 可机器判定的验收
- [ ] B2 OpenAPI 或模块接口契约
- [ ] B3 design：限界上下文 + 依赖（无环）
- [ ] B4 ⛔ critic 评审通过；越界/超框架已改方案或已写 ADR

## C 实现（内核优先）
- [ ] C1 失败测试先行
- [ ] C2 领域内核/service 不依赖框架，repo/handler 为适配器
- [ ] C3 前端按契约并行

## D 验证（过闸才算完成）
- [ ] D1 测试/构建/契约校验 + 端到端证据（verify-gate）
- [ ] D2 ⛔ 架构门禁：无环 / 不跨模块摸内部 / 分层不反向
- [ ] D3 独立审查 diff（code-reviewer / security-reviewer）

## E 收尾
- [ ] E1 成熟规格并回 specs/；change 归档为简略摘要
- [ ] E2 第三次重复才抽进底座；改架构写 ADR
