---
title: 在途方案与生命周期
status: active
last_reviewed: 2026-06-19
---

# changes/ —— 在途方案（先出方案）

## 进行中

- [2026-06-platform-foundation](2026-06-platform-foundation/proposal.md) — 平台底座（多租户后台管理平台）立项（proposed）
- [2026-06-dispatch-foundation](2026-06-dispatch-foundation/design.md) — Dispatch 可靠异步投递底座（横切地基，等价数据源模块地位）（已冻结 DF-1）
- [2026-06-notification](2026-06-notification/design.md) — 块10 通知（一期邮件，建在 Dispatch 之上）（draft）

---

每个变更一个自包含目录：`changes/<yyyy-mm-简述>/`，内含：
- `proposal.md` 要解决什么 / 范围 / 验收标准
- `design.md` 技术方案 / 取舍 / 影响（可链 ADR）
- `tasks.md` 拆成的原子任务
- `specs/` 本次对 [../specs/](../specs/) 的增量（delta）

## 生命周期
1. 建目录，写 `proposal.md` → 评审。
2. 写 `design.md` + `tasks.md`。
3. 实现 + 验证通过。
4. **落地后**：把成熟的设计/规格**合并回 [../specs/](../specs/)**；涉及架构决策 → 在 [../architecture/decisions/](../architecture/decisions/) 写 ADR。
5. **归档（关键）**：变更冻结/已落地后，**不保留全部中间过程**——在 `changes/archived/` 只留**一份简略摘要**（用 [../_templates/archive-summary.md](../_templates/archive-summary.md)：做了什么/为什么/日期/指向最终 spec+ADR+PR 的链接），原始 proposal/design 可删除或压缩，避免中间态堆积。

## 状态流转（front-matter status）
`draft → proposed → active（实现中）→ 合并后归档（superseded/archived）`

---
↑ [返回总索引](../README.md)
