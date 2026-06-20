---
title: ADR 决策记录索引
status: active
last_reviewed: 2026-06-19
---

# decisions/ —— 架构决策记录（ADR）

每个决策一份编号文件，不可变，记录"为什么"。新增：复制 [../../_templates/adr.md](../../_templates/adr.md)，编号递增。

- [0001-record-architecture-decisions.md](0001-record-architecture-decisions.md) — 采用 ADR
- [0002-backend-framework-gale.md](0002-backend-framework-gale.md) — 后端采用 gale 框架与 Go 1.25
- [0003-frontend-stack-react-antd.md](0003-frontend-stack-react-antd.md) — 前端采用 React + Ant Design
- [0004-multi-tenant-db-per-tenant.md](0004-multi-tenant-db-per-tenant.md) — 多租户隔离采用 db-per-tenant（每租户独立库）
- [0005-rbac-self-built-per-tenant.md](0005-rbac-self-built-per-tenant.md) — 授权采用自研 RBAC、各租户库自存、平台运营中心独立
- [0006-audit-unified-stream.md](0006-audit-unified-stream.md) — 审计采用独立模块 + 事务内写入 + 分层落点 + 统一模板
- [0007-compliance-baseline-dengbao.md](0007-compliance-baseline-dengbao.md) — 合规基线锚定等保2.0三级、全局基线按租户可收紧
- [0008-identity-login.md](0008-identity-login.md) — 身份与登录：路径式租户定位 + 本地账密/LDAP + 验证码（MFA/SSO 二期）

---
↑ [上级：architecture](../README.md)　·　[返回总索引](../../README.md)
