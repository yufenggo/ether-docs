#!/usr/bin/env bash
# 文档验证（由 docs-scaffold 生成）。
# 会被全局 verify-gate Stop hook 自动调用；也可手动运行：bash .claude/verify-docs.sh
# 校验：失效链接 + front-matter（scripts/check-docs.mjs）；mermaid 图渲染（全局 mermaid-check.mjs，如有）。
set -u
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT" || exit 0

CHECKER="$ROOT/scripts/check-docs.mjs"
MM="$HOME/.claude/hooks/mermaid-check.mjs"

# 取本次改动的文档（无 git 则全量）
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  files=$(git status --porcelain 2>/dev/null | sed 's/^...//' | sed 's/.* -> //' | grep -Ei '\.(md|mdx|markdown)$' || true)
else
  files=$(find . -name '*.md' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/_templates/*')
fi
[ -z "$files" ] && exit 0

rc=0
[ -f "$CHECKER" ] && { node "$CHECKER" $files || rc=1; }
[ -f "$MM" ] && { node "$MM" $files || rc=1; }   # mermaid 图校验（缺工具则跳过）
exit $rc
