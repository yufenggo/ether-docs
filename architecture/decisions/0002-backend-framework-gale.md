---
title: ADR-0002 后端采用 gale 框架与 Go 1.25
status: accepted
last_reviewed: 2026-06-19
---

# ADR-0002：后端采用 gale 框架与 Go 1.25

- **状态**：accepted
- **日期**：2026-06-19

## 背景
ether-server 为新建 Go 后端。团队已有内部私有基础框架 **gale**（`github.com/yufenggo/gale`），
基于 gin 封装，统一了日志/配置/DB/缓存/消息队列/鉴权/校验等技术选型，目标是"开箱即用、
锁定边界"。

## 决策
1. 后端语言用 **Go 1.25**（宿主机 go1.25.5；gale 以 go 1.22 编写，新工具链向上兼容）。
2. 后端**基于 gale** 开发：数据库 PostgreSQL（gorm 封装）、缓存 Redis（go-redis 封装、含分布式锁）、
   消息队列 NATS + JetStream（watermill-nats 封装），均通过 `gale.*` 门面使用。
3. gale 作为**私有 Go module 依赖**消费，**源码不入 ether-server 仓库**。

## 取舍 / 备选方案
- 直接用 gin / 自选库拼装：灵活但每个项目重复决策、风格不一；gale 已统一，采用之。
- kratos / go-zero 等微服务框架：功能重（服务发现/配置中心等），当前规模不需要。
- gale 的边界限制（仅 HTTP/JSON、单 PostgreSQL、无 gRPC/WS/SSE）当前满足需求；如需突破再评估。

## 影响
- 构建依赖私有库授权：需 `GOPRIVATE=…github.com/yufenggo…` + SSH 拉取凭据；
  **CI/CD 构建机必须有 gale 拉取权限**，否则无法编译；即使拿到 server 源码、无 gale 授权也无法运行。
- 🚫 gale 源码禁止泄漏（不入库、不外传）。
- 具体用法以 gale 自带文档为准，本仓不复制。
