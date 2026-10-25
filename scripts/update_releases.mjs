#!/usr/bin/env node
/**
 * update_releases.mjs — 依据 config/tools.yaml 重新生成 README 工具表格与 data 快照。
 *
 * 职责：
 *  1. 读取 config/tools.yaml（内置极简 YAML 子集解析器，零依赖）。
 *  2. 对每个被追踪工具，通过 GitHub API 获取最新"稳定"版本：
 *     - badge: release  → /repos/{repo}/releases（过滤 draft 与 prerelease，按 semver 取最大）
 *     - badge: tag/endpoint → /repos/{repo}/git/matching-refs/tags/{prefix}（按 semver 取最大稳定 tag）
 *  3. 重写 README 中 <!-- TOOLCHAIN:START --> 与 <!-- TOOLCHAIN:END --> 之间的区块。
 *     版本号绝不写入 README —— 版本由 Shields.io 徽章实时渲染；本脚本只刷新
 *     "最近发布"这一非徽章列（相对时间）。
 *  4. 对 badge: endpoint 的工具，生成 data/badges/{key}.json，供
 *     https://img.shields.io/endpoint 徽章使用（用于 Shields 自带 GitHub tag 端点
 *     无法排除预发布 tag 的场景，如 python/cpython，见 README 已知问题）。
 *  5. 写入 data/releases.json 快照，并输出 Markdown 报告（CI 中写入 $GITHUB_STEP_SUMMARY）。
 *
 * 用法：node scripts/update_releases.mjs [--dry-run]
 * 环境：GITHUB_TOKEN（可选；未认证限额 60 次/小时，认证后 5000 次/小时）
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "config", "tools.yaml");
const README_PATH = join(ROOT, "README.md");
const DATA_DIR = join(ROOT, "data");
const BADGES_DIR = join(DATA_DIR, "badges");
const DATA_PATH = join(DATA_DIR, "releases.json");
const MARK_START = "<!-- TOOLCHAIN:START -->";
const MARK_END = "<!-- TOOLCHAIN:END -->";
const API_BASE = "https://api.github.com";
const REPO_SLUG = process.env.GITHUB_REPOSITORY || "tesesonfire/awesome-dev-toolchain-releases";
const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// 极简 YAML 子集解析器：仅支持 config/tools.yaml 用到的语法
// （嵌套 map / list、标量、行注释、空行）。不支持锚点、流式、多行标量。
// ---------------------------------------------------------------------------

function stripComment(line) {
  let quote = null;
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      out += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) break;
    out += c;
  }
  return out;
}

function scalar(s) {
  s = s.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  if (s === "true") return true;
  if (s === "false") return false;
  return s;
}

function significantLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const s = stripComment(raw);
    if (!s.trim()) continue;
    out.push({ indent: s.match(/^ */)[0].length, body: s.trim() });
  }
  return out;
}

function splitKV(body) {
  const m = body.match(/^([^:]+):\s*(.*)$/);
  if (!m) throw new Error(`无法解析行（应为 "key: value"）: "${body}"`);
  return [m[1].trim(), m[2]];
}

function parseValue(lines, i, indent) {
  if (!lines[i]) throw new Error("配置意外结束（缺少嵌套内容）");
  const isList = lines[i].body.startsWith("- ");
  const result = isList ? [] : {};
  while (i < lines.length && lines[i].indent === indent) {
    const { body } = lines[i];
    if (isList) {
      if (!body.startsWith("- ")) throw new Error(`列表位置出现非列表项: "${body}"`);
      const rest = body.slice(2).trim();
      const itemIndent = indent + 2;
      if (rest === "") {
        // "- " 单独一行，内容在更深层
        i++;
        const [v, ni] = parseValue(lines, i, lines[i].indent);
        result.push(v);
        i = ni;
      } else {
        // "- key: value" 作为条目 map 的第一个键，后续键与内容列对齐
        const map = {};
        const consumeKV = (key, val, idx) => {
          if (val !== "") {
            map[key] = scalar(val);
            return idx + 1;
          }
          const next = idx + 1;
          if (next < lines.length && lines[next].indent > itemIndent) {
            const [v, ni] = parseValue(lines, next, lines[next].indent);
            map[key] = v;
            return ni;
          }
          map[key] = null;
          return next;
        };
        const [k0, v0] = splitKV(rest);
        let j = consumeKV(k0, v0, i);
        while (j < lines.length && lines[j].indent === itemIndent && !lines[j].body.startsWith("- ")) {
          const [k, v] = splitKV(lines[j].body);
          j = consumeKV(k, v, j);
        }
        result.push(map);
        i = j;
      }
    } else {
      const [key, val] = splitKV(body);
      if (val !== "") {
        result[key] = scalar(val);
        i++;
      } else {
        i++;
        if (i < lines.length && lines[i].indent > indent) {
          const [v, ni] = parseValue(lines, i, lines[i].indent);
          result[key] = v;
          i = ni;
        } else {
          result[key] = null;
        }
      }
    }
  }
  if (i < lines.length && lines[i].indent > indent) {
    throw new Error(`意外的缩进层级: "${lines[i].body}"`);
  }
  return [result, i];
}

function parseConfig(text) {
  const lines = significantLines(text);
  if (!lines.length) return { categories: [] };
  const [top, i] = parseValue(lines, 0, lines[0].indent);
  if (i < lines.length) throw new Error(`存在未解析的内容: "${lines[i].body}"`);
  return top;
}

function validateConfig(cfg) {
  if (!Array.isArray(cfg.categories) || cfg.categories.length === 0) {
    throw new Error('配置缺少顶层 "categories:" 列表');
  }
  const seen = new Set();
  let count = 0;
  for (const cat of cfg.categories) {
    if (!cat.id || !cat.name) throw new Error(`分类缺少 id 或 name: ${JSON.stringify(cat)}`);
    if (!Array.isArray(cat.tools) || cat.tools.length === 0) {
      throw new Error(`分类 ${cat.id} 下没有任何工具`);
    }
    for (const t of cat.tools) {
      if (!t.name || !t.repo) throw new Error(`分类 ${cat.id} 下存在缺少 name/repo 的条目`);
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t.repo)) throw new Error(`非法 repo 字段: ${t.repo}`);
      if (seen.has(t.repo)) throw new Error(`重复追踪同一仓库: ${t.repo}`);
      seen.add(t.repo);
      if (t.badge && !["release", "tag", "endpoint"].includes(t.badge)) {
        throw new Error(`${t.repo}: badge 仅支持 release / tag / endpoint`);
      }
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// semver 解析：兼容 v 前缀、无前缀、bun-v1.x / jq-1.x / go1.x 等风格
// ---------------------------------------------------------------------------

const VERSION_CORE_RE = /(?<![\d.])(\d+)\.(\d+)(?:\.(\d+))?(?:[-._]?(rc|alpha|beta|pre|dev|a|b|c)[._-]?(\d+)?)?/i;
const PRE_RANK = { a: 0, alpha: 0, b: 1, beta: 1, pre: 2, dev: 2, rc: 3 };

/**
 * 从 tag 提取可排序版本号，返回 [major, minor, patch, isFinal, preRank, preNum]。
 * 关键字后缀（rc/alpha/beta…）以及任何 "-x" / "+x" 后缀（如 v2.0.1-hotfix.6）都视为
 * 预发布 —— 与 Shields.io sort=semver 的口径一致，保证脚本选中的版本与徽章渲染一致。
 */
function parseVersion(tag) {
  const m = VERSION_CORE_RE.exec(tag || "");
  if (!m) return null;
  const rest = (tag || "").slice(m.index + m[0].length);
  let pre;
  if (m[4]) {
    pre = [0, PRE_RANK[m[4].toLowerCase()] ?? 2, Number(m[5] || 0)];
  } else if (/^[-+]/.test(rest)) {
    pre = [0, 2, 0];
  } else {
    pre = [1, 0, 0];
  }
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0), pre[0], pre[1], pre[2]];
}

function cmpVersion(a, b) {
  for (let k = 0; k < 6; k++) {
    if ((a[k] || 0) !== (b[k] || 0)) return (a[k] || 0) - (b[k] || 0);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------

function ghHeaders(token) {
  const h = {
    "User-Agent": "awesome-dev-toolchain-releases",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghJson(url, token) {
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (res.status === 404) return { notFound: true };
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    throw new Error(`GitHub API 限流（HTTP ${res.status}，remaining=${remaining}）。请设置 GITHUB_TOKEN。`);
  }
  if (res.status === 401) throw new Error("GitHub API 401：GITHUB_TOKEN 无效");
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}: ${url}`);
  return { data: await res.json() };
}

/** badge: release —— 取 semver 最大的稳定（非 draft、非 prerelease）Release，口径与 Shields sort=semver 一致 */
async function latestRelease(tool, token) {
  const r = await ghJson(`${API_BASE}/repos/${tool.repo}/releases?per_page=100`, token);
  if (r.notFound) return { issue: "仓库不存在或不可访问（404）" };
  const cands = [];
  for (const rel of r.data) {
    if (rel.draft) continue;
    if (rel.prerelease && tool.include_prereleases !== true) continue;
    const v = parseVersion(rel.tag_name);
    if (!v) continue;
    cands.push({ v, rel });
  }
  if (!cands.length) return { issue: "该仓库没有可用的稳定 Release" };
  cands.sort((a, b) => cmpVersion(a.v, b.v));
  const best = cands[cands.length - 1].rel;
  let endpointTag = null;
  const lr = await ghJson(`${API_BASE}/repos/${tool.repo}/releases/latest`, token);
  if (!lr.notFound && lr.data) endpointTag = lr.data.tag_name;
  return {
    tag: best.tag_name,
    publishedAt: best.published_at || best.created_at,
    url: best.html_url,
    apiLatestEndpointTag: endpointTag,
  };
}

/**
 * badge: tag / endpoint —— 该仓库无 GitHub Releases，改用 git refs 抓取最新稳定 tag。
 * 返回 tag 名与该 tag 的打标/提交时间（作为"最近发布"的近似值）。
 */
async function latestTag(tool, token) {
  const prefix = tool.tag_prefix || "";
  const cands = [];
  let lastError = null;
  for (let page = 1; page <= 12; page++) {
    const r = await ghJson(
      `${API_BASE}/repos/${tool.repo}/git/matching-refs/tags/${prefix}?per_page=100&page=${page}`,
      token,
    );
    if (r.notFound) return { issue: "仓库不存在或不可访问（404）" };
    if (!Array.isArray(r.data) || r.data.length === 0) break;
    for (const ref of r.data) {
      const name = ref.ref.replace(/^refs\/tags\//, "");
      const v = parseVersion(name);
      if (!v) continue;
      if (v[3] !== 1 && tool.include_prereleases !== true) continue; // 排除 rc/alpha/beta 等
      cands.push({ v, name, sha: ref.object.sha, type: ref.object.type });
    }
  }
  if (!cands.length) {
    if (lastError) return { issue: `获取 tags 失败：${lastError}` };
    return { issue: "未找到匹配的稳定 tag" };
  }
  cands.sort((a, b) => cmpVersion(a.v, b.v));
  const best = cands[cands.length - 1];
  let date = null;
  if (best.type === "tag") {
    // annotated tag：ref 指向 tag 对象，取 tagger 日期
    const t = await ghJson(`${API_BASE}/repos/${tool.repo}/git/tags/${best.sha}`, token);
    if (!t.notFound && t.data) date = t.data.tagger?.date || null;
  }
  if (!date) {
    const c = await ghJson(`${API_BASE}/repos/${tool.repo}/commits/${best.sha}`, token);
    if (!c.notFound && c.data) date = c.data.commit?.committer?.date || null;
  }
  return { tag: best.name, publishedAt: date, url: `https://github.com/${tool.repo}/tags` };
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------

function relTime(iso, now) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  let diff = now - t;
  if (diff < 0) diff = 0;
  const DAY = 86400000;
  if (diff < DAY) return "24 小时内";
  const days = Math.floor(diff / DAY);
  if (days < 30) return `${days} 天前`;
  const d = new Date(t);
  const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return d.getUTCFullYear() === new Date(now).getUTCFullYear() ? mmdd : `${d.getUTCFullYear()}-${mmdd}`;
}

function clean(s) {
  return String(s ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function badgeUrl(tool) {
  if (tool.badge === "endpoint") {
    const raw = `https://raw.githubusercontent.com/${REPO_SLUG}/main/data/badges/${keyOf(tool)}.json`;
    return `https://img.shields.io/endpoint?url=${encodeURIComponent(raw)}`;
  }
  const kind = modeOf(tool) === "tag" ? "tag" : "release";
  return `https://img.shields.io/github/v/${kind}/${tool.repo}?sort=semver&display_name=tag`;
}

/** 徽章模式：未显式配置时默认 release */
function modeOf(tool) {
  return tool.badge || "release";
}

function keyOf(tool) {
  return tool.repo.replace("/", "-");
}

function buildRow(tool, info) {
  const repoUrl = `https://github.com/${tool.repo}`;
  const linkTarget = modeOf(tool) === "release" ? `${repoUrl}/releases` : `${repoUrl}/tags`;
  const descParts = [clean(tool.description) || "—"];
  if (tool.note) descParts.push(`📌 ${clean(tool.note)}`);
  if (info?.issue) descParts.push(`⚠️ ${clean(info.issue)}`);
  const time = info?.issue || !info ? "—" : `\`${info.relTime}\``;
  return (
    `| [${clean(tool.name)}](${repoUrl}) ` +
    `| [![${clean(tool.name)} latest version](${badgeUrl(tool)})](${linkTarget}) ` +
    `| ${time} ` +
    `| [\`${tool.repo}\`](${repoUrl}) ` +
    `| ${descParts.join(" <br>")} |`
  );
}

function buildSection(config, results, checkedAt) {
  const out = [];
  out.push("<!-- 本区块由 scripts/update_releases.mjs 依据 config/tools.yaml 自动生成；请勿手工编辑 -->");
  for (const cat of config.categories) {
    out.push("", `### ${clean(cat.name)}`, "");
    out.push("| 工具 | 最新版本 | 最近发布 | 仓库 | 简介 |");
    out.push("| :-- | :-- | :--: | :-- | :-- |");
    for (const t of cat.tools) out.push(buildRow(t, results.get(t.repo)));
  }
  out.push(
    "",
    `> 🕒 数据更新时间（UTC）：**${checkedAt}** · 由 [update-releases workflow](.github/workflows/update-releases.yml) 每 12 小时刷新；版本徽章由 Shields.io 实时渲染，不受本页缓存影响。`,
    ">",
    "> 时间口径：24 小时内 → `24 小时内`；30 天内 → `N 天前`；更早 → `MM-DD`（跨年显示 `YYYY-MM-DD`）。",
    "> “最新版本”为 semver 排序最高的稳定版本（不含预发布）。无 GitHub Releases 的工具（Go、Python）基于最新稳定 tag，时间为该 tag 的打标/提交时间。",
  );
  return out.join("\n");
}

function spliceReadme(readme, section) {
  const s = readme.indexOf(MARK_START);
  const e = readme.indexOf(MARK_END);
  if (s < 0 || e < 0 || e < s) {
    throw new Error("README 缺少 TOOLCHAIN 标记区块");
  }
  return readme.slice(0, s + MARK_START.length) + "\n" + section + "\n" + readme.slice(e);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const token = process.env.GITHUB_TOKEN || "";
  const config = parseConfig(readFileSync(CONFIG_PATH, "utf8"));
  const toolCount = validateConfig(config);
  const now = Date.now();
  const checkedAt = new Date(now).toISOString().replace("T", " ").slice(0, 16);

  const results = new Map();
  const reportRows = [];
  const issues = [];

  for (const cat of config.categories) {
    for (const tool of cat.tools) {
      let info;
      try {
        info = modeOf(tool) === "release" ? await latestRelease(tool, token) : await latestTag(tool, token);
      } catch (err) {
        info = { issue: `抓取失败：${err.message}` };
      }
      info.relTime = relTime(info.publishedAt, now);
      info.category = cat.name;
      results.set(tool.repo, info);

      if (info.issue) issues.push(`${tool.repo}：${info.issue}`);
      const divergence =
        info.apiLatestEndpointTag && info.tag && info.apiLatestEndpointTag !== info.tag
          ? `（注意：GitHub /releases/latest 指向 ${info.apiLatestEndpointTag}）`
          : "";
      reportRows.push(
        `| ${clean(tool.name)} | ${tool.repo} | ${info.tag ?? "—"} | ${info.relTime} | ${info.issue ? "⚠️ " + info.issue : "✅"}${divergence} |`,
      );

      // endpoint 徽章数据（badge: endpoint）
      if (modeOf(tool) === "endpoint" && info.tag) {
        const badgeJson = {
          schemaVersion: 1,
          label: "最新稳定 tag",
          message: info.tag,
          color: "blue",
          link: [`https://github.com/${tool.repo}/tags`],
        };
        if (!DRY_RUN) {
          mkdirSync(BADGES_DIR, { recursive: true });
          writeFileSync(join(BADGES_DIR, `${keyOf(tool)}.json`), JSON.stringify(badgeJson, null, 2) + "\n");
        }
      }

      process.stdout.write(`  ${info.issue ? "⚠" : "✓"} ${tool.repo.padEnd(26)} ${String(info.tag ?? "—").padEnd(14)} ${info.relTime}\n`);
    }
  }

  // 生成 README 区块并写回
  const readme = readFileSync(README_PATH, "utf8");
  const section = buildSection(config, results, checkedAt);
  const updatedReadme = spliceReadme(readme, section);

  const snapshot = {
    checked_at: new Date(now).toISOString(),
    source: "GitHub REST API (api.github.com)；版本展示由 Shields.io 渲染",
    repo: REPO_SLUG,
    tool_count: toolCount,
    tools: [...results.entries()].map(([repo, info]) => ({
      repo,
      category: info.category,
      tag: info.tag ?? null,
      published_at: info.publishedAt ?? null,
      release_url: info.url ?? null,
      badge_url: null,
      issue: info.issue ?? null,
      note: info.apiLatestEndpointTag && info.tag && info.apiLatestEndpointTag !== info.tag
        ? `GitHub /releases/latest 指向 ${info.apiLatestEndpointTag}`
        : null,
    })),
  };
  // badge_url 单独填（避免 info 对象直接泄漏内部字段）
  for (const cat of config.categories) {
    for (const tool of cat.tools) {
      const row = snapshot.tools.find((x) => x.repo === tool.repo);
      if (row) row.badge_url = badgeUrl(tool);
    }
  }

  if (!DRY_RUN) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(README_PATH, updatedReadme);
    writeFileSync(DATA_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  }

  // Markdown 报告（CI 中 tee 到 $GITHUB_STEP_SUMMARY）
  const lines = [];
  lines.push("## Release 数据更新报告");
  lines.push("");
  lines.push(`- 检查时间（UTC）：**${checkedAt}**`);
  lines.push(`- 工具总数：${toolCount}；成功：${toolCount - issues.length}；异常：${issues.length}`);
  if (issues.length) lines.push(`- ⚠️ 异常：${issues.join("；")}`);
  lines.push("");
  lines.push("| 工具 | 仓库 | 最新稳定版本（tag） | 最近发布 | 状态 |");
  lines.push("| :-- | :-- | :-- | :--: | :-- |");
  lines.push(...reportRows);
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
