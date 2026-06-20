# AGENTS.md —— 本文档仓库的 agent 工作约定

> 给 AI 编码/写作 agent 的入口。人看的总览见 [README.md](README.md)。

## 这个仓库是什么
项目的"事实来源"。**先出方案再实现**：任何功能/改动先在 `changes/` 写方案，评审通过、落地并验证后，把成熟设计**合并回 `specs/`**，`changes/` 只留简略归档。

## 硬约定
- 每篇文档都要有 **front-matter**（`title / status / owner / last_reviewed`，见模板）。
- 新文档**必须基于 `_templates/` 的模板**创建，保持骨架一致。
- 文档里引用本地文件/路径要真实存在（提交前会被 `scripts/check-docs.mjs` 校验）。
- 改动文档后会触发文档验证（见"验证"）。不通过不算完成。

## 目录导航
- `product/` 目标、范围、术语表
- `architecture/` 现状架构、技术栈、ADR 决策记录
- `specs/` 各能力的**当前**规格（living）
- `changes/` **在途**方案（proposal/design/tasks/delta）；`changes/archived/` 简略归档
- `contracts/` 前后端协议契约（OpenAPI/AsyncAPI，契约即真理）
- `guides/`、`explanation/` Diátaxis 操作类/解释类

## 验证（防漂移）
本仓自带 `.claude/verify-docs.sh` + `scripts/check-docs.mjs`：校验失效链接、front-matter 完整性、过期提醒。会被全局 verify-gate Stop hook 自动调用。手动跑：`node scripts/check-docs.mjs`。
