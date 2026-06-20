---
title: 技术栈与选型
status: draft
last_reviewed: 2026-06-19
---

# 技术栈与选型

## 后端（ether-server）

| 类别 | 选型 | 说明 / 关联 |
|---|---|---|
| 语言 | Go 1.25 | 宿主机 go1.25.5；gale 以 go 1.22 编写、向上兼容 |
| 基础框架 | **gale**（私有） | 内部框架，基于 gin；门面包 `github.com/yufenggo/gale`。见 ADR-0002 |
| 数据库 | PostgreSQL | 经 gale 的 gorm 封装，单库 |
| 缓存 | Redis | 经 gale 的 go-redis 封装（含分布式锁） |
| 消息队列 | NATS + JetStream | 经 gale 的 watermill-nats 封装 |
| 通信 | HTTP/1.1+2 + JSON | gale 不支持 gRPC/WebSocket/SSE |

> gale 为私有依赖：以 Go module 消费、源码不入库、CI 需拉取授权。详见
> [decisions/0002-backend-framework-gale.md](decisions/0002-backend-framework-gale.md) 与
> ether-server 的 README。

## 前端（ether-admin）

| 类别 | 选型 | 说明 / 关联 |
|---|---|---|
| 框架 | React + TypeScript | AI 写得稳、TS 类型自查。见 ADR-0003 |
| 构建 | Vite | 事实标准 |
| UI 组件库 | Ant Design (antd) | 后台管理组件齐全 |
| API 客户端 | openapi-typescript / openapi-fetch | 从 contracts/openapi 生成类型化客户端 |
| 服务端状态 | TanStack Query | 请求缓存/加载/重试 |
| 客户端状态 | Zustand | 轻量 |
| 表单 / 校验 | react-hook-form + zod | 表单 + 运行时校验 |

> 详见 [decisions/0003-frontend-stack-react-antd.md](decisions/0003-frontend-stack-react-antd.md)
> 与 ether-admin 的 README。

## 数据与中间件

| 组件 | 用途 |
|---|---|
| PostgreSQL | 主数据库（单库） |
| Redis | 缓存 + 分布式锁 |
| NATS + JetStream | 消息队列 / 事件 |

> 重大选型请同时在 [decisions/](decisions/) 写一条 ADR 记录"为什么"。
