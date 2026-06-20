---
title: ADR-0008 身份与登录：路径式租户定位 + 本地账密/LDAP + 验证码（MFA/SSO 二期）
status: accepted
last_reviewed: 2026-06-20
---

# ADR-0008：身份与登录（租户定位 + 认证方式）

> ADR = Architecture Decision Record（架构决策记录），记录本决策"为什么"。见 [ADR-0001](0001-record-architecture-decisions.md)。

- **状态**：accepted
- **日期**：2026-06-20
- **关联**：承接 [ADR-0004](0004-multi-tenant-db-per-tenant.md)（db-per-tenant）、[ADR-0005](0005-rbac-self-built-per-tenant.md)（各租户库自存用户）；
  对应 2026-06 平台底座（在途 changes/）决策 D5/D6，整改见其 review-blocks-1-2.md。

## 背景
db-per-tenant 下，登录前需先定位租户才能连其库；并需确定一期认证方式与企业目录对接范围。

## 决策
1. **租户定位 = 路径式 `主域名/{tenantCode}`**：直达时 tenantCode 在登录页锁死；平台运营侧 `主域名/admin`，
   登录默认不带 tenantCode、以保留字 `platform` 传递；根路径**引导页**由 邮箱域名/企业code/全名称 解析出 tenantCode。
2. **一期认证 = 本地账密 + LDAP/AD**，二者**均强制验证码**。
3. **MFA（双因素）与完整企业 SSO（每租户 OIDC/SAML 联邦）二期**；一期数据模型**预留"每租户认证配置"**。
4. **账号体系（D7）= 租户内独立**：同一自然人在不同租户是不同账号；平台运营为单独的跨租户账号体系。

## 安全约束（来自块1/块2 评审，强制）
- **租户定位**：tenantCode 后端强校验**唯一 + 保留字黑名单**（platform/admin/api/login/static/.well-known…）+ 格式正则；
  解析做规范化（lowercase/trim/`[a-z0-9-]`）；未知/异常态租户**无差别响应 + 同等延迟**防枚举；解析端点限流。
- **取连接**：唯一入口 = 请求 ctx，业务层不得显式传 tenantCode（见 review F5）。
- **JWT**：令牌**内嵌并强校验 tenantCode**（A 租户令牌打 B 路由必拒）；支持撤销/黑名单（租户锁定/待销毁即时失效）；刷新令牌轮换。
- **LDAP**：filter 转义防注入；强制 **LDAPS/StartTLS + 证书校验**；每租户 LDAP host 做**出站校验防 SSRF**；bind 凭据按密钥管理。
- **登录失败**：统一失败响应 + 延迟防枚举；锁定结合 IP+账号、管理员留解锁/申诉防 DoS；租户库不可达 **fail-closed** 通用错误 + 告警。

## 取舍 / 备选方案
- 子域 / 自定义域名定位：体验好但需 DNS/证书，运营更重；选路径式（统一建模复用），自定义域名后续增值。
- 一期上完整 SSO/MFA：ToB 强需求但重，且联邦复杂度高；推迟二期，一期预留每租户认证配置。

## 影响
- ⚠️**一期无 MFA**（含平台运营/超管），属**已接受风险**；补偿见 review F9（高危操作双人复核/通知/最小权限拆分）。
- ⚠️**等保三级"双因素"一期未满足**，二期由 MFA 补齐（[ADR-0007](0007-compliance-baseline-dengbao.md)）。
- 认证方式按租户可配，且其可用性受功能权益（C5，已移至运营/盈利模块、一期暂不做）将来门控。
