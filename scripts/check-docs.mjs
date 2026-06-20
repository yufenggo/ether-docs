#!/usr/bin/env node
// 文档检查器（由 docs-scaffold 生成，随 docs 仓库一起版本化）。
// 检查项：
//   1. 结构漂移：Markdown 里指向本地、却已不存在的链接/引用路径
//   2. front-matter：必填字段(title/status/last_reviewed)齐全、status 合法、日期合法
//   3. 过期提醒：last_reviewed 超过阈值 → 仅警告(不阻断)，提示可能语义漂移
// 用法：node scripts/check-docs.mjs [file1.md file2.md ...]   不传参则扫描全仓
// 退出：有错误 → 1；否则 → 0
import fs from "fs";
import path from "path";

const ALLOWED = ["draft", "proposed", "active", "accepted", "superseded", "archived"];
const REQUIRED = ["title", "status", "last_reviewed"];
const STALE_DAYS = 180;
const SKIP_DIRS = new Set(["node_modules", ".git", "_templates"]);
// meta / 导航类文件：豁免 front-matter 要求（但仍检查失效链接）
const EXEMPT_FM = new Set([
  "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "CHANGELOG.md",
  "LICENSE.md", "SECURITY.md", "CODE_OF_CONDUCT.md",
]);

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), acc);
    } else if (/\.(md|mdx|markdown)$/i.test(e.name)) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

let files = process.argv.slice(2);
if (files.length === 0) files = walk(process.cwd(), []);
files = files.filter((f) => !f.includes("/_templates/") && fs.existsSync(f));

const errors = [];
const warns = [];

for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");

  // ---- front-matter ----（meta 文件豁免）
  const m = txt.match(/^---\n([\s\S]*?)\n---/);
  const exempt = EXEMPT_FM.has(path.basename(f));
  if (!m) {
    if (!exempt) errors.push(`${f}: 缺少 front-matter（--- ... ---）`);
  } else if (!exempt) {
    const fm = {};
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    for (const k of REQUIRED) if (!fm[k]) errors.push(`${f}: front-matter 缺少必填字段 '${k}'`);
    if (fm.status && !ALLOWED.includes(fm.status))
      errors.push(`${f}: status='${fm.status}' 非法（允许：${ALLOWED.join(" / ")}）`);
    if (fm.last_reviewed) {
      const d = Date.parse(fm.last_reviewed);
      if (isNaN(d)) errors.push(`${f}: last_reviewed 不是合法日期：${fm.last_reviewed}`);
      else {
        const days = (Date.now() - d) / 86400000;
        if (days > STALE_DAYS)
          warns.push(`${f}: 已 ${Math.round(days)} 天未复核（last_reviewed=${fm.last_reviewed}），可能与代码漂移`);
      }
    }
  }

  // ---- 本地链接/引用 ----
  const cleaned = txt.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  const dir = path.dirname(f);
  const re = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let lm;
  while ((lm = re.exec(cleaned))) {
    let t = lm[1].trim().split(/\s+/)[0];
    if (!t) continue;
    if (/^(https?:|mailto:|tel:|data:|ftp:|#)/i.test(t) || t.startsWith("//")) continue;
    if (t.includes("${") || t.includes("{{")) continue;
    t = t.replace(/[#?].*$/, "");
    if (!t) continue;
    const base = t.startsWith("/") ? process.cwd() : dir;
    const rel = t.startsWith("/") ? "." + t : t;
    if (!fs.existsSync(path.resolve(base, rel)))
      errors.push(`${f}: 失效本地链接/引用 -> ${lm[1].trim()}`);
  }
}

for (const w of warns) console.error("⚠️  " + w);
if (errors.length) {
  console.error("❌ 文档检查失败：");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`✅ 文档检查通过（${files.length} 个文件）${warns.length ? `，${warns.length} 条过期提醒` : ""}`);
process.exit(0);
