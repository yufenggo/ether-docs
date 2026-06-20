---
title: 术语表 / 通用技术解释
status: active
last_reviewed: 2026-06-19
---

# 术语表 / 通用技术解释

> 业务与通用技术名词的统一解释，避免各文档各说各话。解释要通俗、结合上下文，不做字面直译。

| 术语 | 解释 |
|---|---|
| `tenant_code` | 租户（一家客户）的**全局唯一、不可变业务码**（蛇形小写）。用于 URL 路径段 `/{tenant_code}`、JWT claim、Redis key 段、前后端契约字段等所有对外/跨层标识。**统一用它，不用 `tid`**（避免与 JWT ID/`jti` 混）。 |
| `platform` | 保留值：平台运营/超管面（非具体租户）。运营侧入口 `/admin`，认证 plane=platform。 |
| plane | 平面：`t`（租户面）/ `platform`（平台运营面）。同一套会话/认证机制，命名空间区分。 |
| `jti` | JWT ID：单个 JWT 的唯一标识（标准 claim）。与 `tenant_code` 是两回事，勿混。 |
| AT / RT | Access Token（访问令牌，短命）/ Refresh Token（刷新令牌，长命，用于静默换 AT）。 |
