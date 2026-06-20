---
title: 前后端协议契约
status: active
last_reviewed: 2026-06-19
---

# contracts/ —— 协议契约（契约即真理）

前后端从同一份契约出发，可**并行开发**，并据此生成客户端/mock/做契约校验。

- `openapi/` REST 接口：`openapi.yaml`（可按服务/版本拆分）
- `asyncapi/` 事件 / 消息（NATS + JetStream 等异步通信）

## 什么是 OpenAPI / AsyncAPI（为什么用、是否通用）

**OpenAPI 不是网络协议，也不是框架，而是一种"用标准格式描述 HTTP/REST 接口"的规范。**
真正传输数据的仍是 HTTP + JSON；OpenAPI 只是把"这个接口长什么样"（路径、方法、参数、
请求/响应体字段与类型、错误码、鉴权）写成一份**机器可读**的文件（`openapi.yaml`）。前身/旧名
是 Swagger，当前主流为 3.x。

**为什么用它（好处）：**
- **单一事实来源 + 前后端并行**：先定契约，前端照契约写、后端照契约实现，互不等待。
- **自动生成**：从一份 yaml 生成前端**类型化客户端**、后端**校验/桩代码**、**接口文档**
  （Swagger UI / Redoc）、**Mock 服务**；契约一改，生成物跟着变 → 少写样板、**防漂移**。
- **可校验/可测试**：运行时校验请求/响应是否符合契约；CI 可检测**破坏性变更**、做风格 lint。
- **降低沟通与上手成本**：人或 AI agent 读一份文件即懂全部接口。

**是否业内通用：是，且是事实标准。** OpenAPI 由 Linux 基金会下的 OpenAPI Initiative 治理，
主流 API 工具（Postman、Swagger、Stoplight、各类网关）与各语言代码生成器几乎全支持。

**适用范围（各管一段，不是不通用）：**

| 通信形态 | 用的规范 | 本项目 |
|---|---|---|
| REST / HTTP 请求-响应 | **OpenAPI** | 后端 gale 仅 HTTP/JSON → 用它 |
| 事件 / 消息（异步） | **AsyncAPI** | NATS + JetStream → 用它 |
| GraphQL | GraphQL Schema(SDL) | 未使用 |
| gRPC | Protobuf | 未使用（gale 不支持） |

> 一句话：**契约文件只是"用机器可读的标准格式表达 API 的形态与内容"**，价值在于让它成为
> 前后端共同的单一真理，并据此自动生成与校验。

## 约定
- 契约是**源真理**：先改契约、评审，再改实现。
- 破坏性变更需走 [../changes/](../changes/README.md) 并记 ADR。

---
↑ [返回总索引](../README.md)
