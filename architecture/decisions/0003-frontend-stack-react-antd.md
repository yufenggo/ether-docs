---
title: ADR-0003 前端采用 React + Ant Design
status: accepted
last_reviewed: 2026-06-20
---

# ADR-0003：前端采用 React + Ant Design

- **状态**：accepted
- **日期**：2026-06-20

## 背景
ether-admin 为管理端前端，**全程由 AI agent 编写**，对接 Go(gale) 后端的 OpenAPI
(HTTP/JSON) 契约。需要一套"AI 写得稳、后台组件齐全、与契约同步"的技术栈。

## 决策
采用 **React + TypeScript + Vite + Ant Design**：
- 服务端状态 TanStack Query；客户端状态 Zustand；表单 react-hook-form + zod。
- API 客户端用 **openapi-typescript / openapi-fetch** 从 `contracts/openapi` **生成类型化客户端**，不手写接口类型。

## 取舍 / 备选方案
- **React vs Vue3 + Element Plus**：两者后台生态都成熟；选 React 因 AI 训练语料最大、
  写得最稳，TS 类型利于 agent 自查。
- **antd vs shadcn/Tailwind**：管理端重表格/表单，antd 开箱即用组件最多；shadcn 更可定制
  但需大量自写、开发更慢，不选。

## 影响
- 前端接口类型从 OpenAPI 契约生成 → 与后端类型同步、防漂移。
- 鉴权对接后端 JWT。
- 打包产物 `dist/`，不提交（见全局约束第 8 节）。
