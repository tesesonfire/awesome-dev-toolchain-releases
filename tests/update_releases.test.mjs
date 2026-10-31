// 纯逻辑单元测试（零依赖，node --test 运行）。
// 覆盖：YAML 子集解析、semver 提取与排序、相对时间口径、配置校验、并发调度、
//      以及 README 区块拼接 —— 这些逻辑一旦出错就会静默产出错误的表格。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseConfig,
  parseVersion,
  cmpVersion,
  relTime,
  clean,
  badgeUrl,
  buildRow,
  buildSection,
  spliceReadme,
  validateConfig,
  mapLimit,
  resolveConcurrency,
  withRetry,
  isRetryable,
  loadPreviousSnapshot,
} from "../scripts/update_releases.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// YAML 子集解析
// ---------------------------------------------------------------------------

test("parseConfig 解析嵌套分类与工具列表", () => {
  const cfg = parseConfig(`
categories:
  - id: runtimes
    name: 语言运行时
    tools:
      - name: Rust
        repo: rust-lang/rust
        description: 系统级编程语言。
      - name: Go
        repo: golang/go
        description: 静态类型语言。
        badge: tag
        tag_prefix: go1
`);
  assert.equal(cfg.categories.length, 1);
  assert.equal(cfg.categories[0].id, "runtimes");
  assert.equal(cfg.categories[0].tools.length, 2);
  assert.equal(cfg.categories[0].tools[1].badge, "tag");
  assert.equal(cfg.categories[0].tools[1].tag_prefix, "go1");
});

test("parseConfig 忽略行注释与空行，保留字符串内的 # 与全角标点", () => {
  const cfg = parseConfig(`
# 顶层注释
categories:
  - id: cli   # 行尾注释
    name: 通用 CLI
    tools:
      - name: yq
        repo: mikefarah/yq
        description: YAML / XML / CSV 处理器（Go 实现）。
`);
  assert.equal(cfg.categories[0].tools[0].description, "YAML / XML / CSV 处理器（Go 实现）。");
});

test("parseConfig 把 true/false 解析为布尔值", () => {
  const cfg = parseConfig(`
categories:
  - id: c
    name: C
    tools:
      - name: X
        repo: a/b
        description: d
        include_prereleases: true
`);
  assert.equal(cfg.categories[0].tools[0].include_prereleases, true);
});

test("parseConfig 在非法行上抛错而不是静默忽略", () => {
  assert.throws(() => parseConfig("categories:\n  - id: c\n    name: C\n    tools:\n      - name: X\n        repo a/b\n"), /无法解析行/);
});

test("仓库自身的 config/tools.yaml 可以被解析且通过校验", () => {
  const cfg = parseConfig(readFileSync(join(ROOT, "config", "tools.yaml"), "utf8"));
  const count = validateConfig(cfg);
  assert.ok(count >= 18, `工具数量应至少为 18，实际 ${count}`);
  const repos = cfg.categories.flatMap((c) => c.tools.map((t) => t.repo));
  assert.ok(repos.includes("pnpm/pnpm"), "config 应包含 pnpm/pnpm");
});

// ---------------------------------------------------------------------------
// semver
// ---------------------------------------------------------------------------

test("parseVersion 兼容 v 前缀、多段前缀与缺省 patch", () => {
  assert.deepEqual(parseVersion("v1.2.3").slice(0, 3), [1, 2, 3]);
  assert.deepEqual(parseVersion("1.2.3").slice(0, 3), [1, 2, 3]);
  assert.deepEqual(parseVersion("v1.2").slice(0, 3), [1, 2, 0]);
  assert.deepEqual(parseVersion("bun-v1.4.4").slice(0, 3), [1, 4, 4]);
  assert.deepEqual(parseVersion("jq-1.8.2").slice(0, 3), [1, 8, 2]);
  assert.deepEqual(parseVersion("go1.27.3").slice(0, 3), [1, 27, 3]);
  assert.equal(parseVersion("nightly"), null);
});

test("parseVersion 把 rc/alpha/beta 与任何连字符后缀判为预发布", () => {
  assert.equal(parseVersion("v2.0.0-rc.1")[3], 0);
  assert.equal(parseVersion("v2.0.0-alpha1")[3], 0);
  assert.equal(parseVersion("v2.0.0-beta")[3], 0);
  // 与 Shields sort=semver 对齐：-hotfix.x 这类后缀同样视为预发布
  assert.equal(parseVersion("v2.0.1-hotfix.6")[3], 0);
  assert.equal(parseVersion("v2.0.0")[3], 1);
});

test("cmpVersion 排序：稳定版高于同号预发布，且按数值而非字典序比较", () => {
  const sorted = ["v1.10.0", "v1.9.9", "v1.10.0-rc.1", "v1.9.10"]
    .map((t) => [t, parseVersion(t)])
    .sort((a, b) => cmpVersion(a[1], b[1]))
    .map(([t]) => t);
  // 稳定版 v1.10.0 最大；v1.10.0-rc.1 紧随其后（预发布低于同号稳定版）；
  // v1.9.10 > v1.9.9 证明按数值比较而不是字典序。
  assert.deepEqual(sorted, ["v1.9.9", "v1.9.10", "v1.10.0-rc.1", "v1.10.0"]);
  assert.ok(cmpVersion(parseVersion("v1.9.10"), parseVersion("v1.9.9")) > 0);
  assert.ok(cmpVersion(parseVersion("v2.0.0"), parseVersion("v2.0.0-rc.1")) > 0);
});

// ---------------------------------------------------------------------------
// 相对时间
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-10-29T12:00:00Z");
const at = (iso) => relTime(iso, NOW);

test("relTime 遵循 24h / N 天 / MM-DD / 跨年 YYYY-MM-DD 口径", () => {
  assert.equal(at("2026-10-29T00:00:00Z"), "24 小时内");
  assert.equal(at("2026-10-27T00:00:00Z"), "2 天前");
  assert.equal(at("2026-10-29T12:00:00Z"), "24 小时内");
  // 29 天仍在 30 天窗口内 → 相对天数；超过 30 天才切换为 MM-DD
  assert.equal(at("2026-09-30T12:00:00Z"), "29 天前");
  assert.equal(at("2026-09-01T00:00:00Z"), "09-01");
  assert.equal(at("2026-09-21T00:00:00Z"), "09-21");
  assert.equal(at("2025-12-02T00:00:00Z"), "2025-12-02");
});

test("relTime 对未来时间与非法输入做降级", () => {
  assert.equal(at("2026-12-01T00:00:00Z"), "24 小时内");
  assert.equal(at("not-a-date"), "—");
  assert.equal(relTime(null, NOW), "—");
});

// ---------------------------------------------------------------------------
// 展示与渲染
// ---------------------------------------------------------------------------

test("clean 清除会破坏表格的竖线与换行", () => {
  assert.equal(clean("a|b\nc"), "a/b c");
  assert.equal(clean(null), "");
  assert.equal(clean("  x  "), "x");
});

test("badgeUrl 按模式生成不同端点", () => {
  assert.equal(
    badgeUrl({ repo: "rust-lang/rust" }),
    "https://img.shields.io/github/v/release/rust-lang/rust?sort=semver&display_name=tag",
  );
  assert.equal(
    badgeUrl({ repo: "golang/go", badge: "tag" }),
    "https://img.shields.io/github/v/tag/golang/go?sort=semver&display_name=tag",
  );
  assert.match(badgeUrl({ repo: "python/cpython", badge: "endpoint" }), /^https:\/\/img\.shields\.io\/endpoint\?url=/);
});

test("buildRow 的仓库链接指向 releases 或 tags", () => {
  const tool = { name: "pnpm", repo: "pnpm/pnpm", description: "包管理器。" };
  const row = buildRow(tool, { relTime: "2 天前" });
  assert.match(row, /\]\(https:\/\/github\.com\/pnpm\/pnpm\/releases\)/);
  assert.match(row, /`2 天前`/);
  assert.equal(row.split("|").length - 2, 5, "应为 5 列的表格行");
});

test("buildRow 在抓取异常时用 — 占位并保留 ⚠️ 说明", () => {
  const row = buildRow({ name: "X", repo: "a/b", description: "d" }, { issue: "仓库不存在或不可访问（404）" });
  assert.match(row, /⚠️ 仓库不存在/);
  assert.match(row, /\| — \|/);
});

test("spliceReadme 只替换标记区块，区块外内容保持不变", () => {
  const readme = "前言\n<!-- TOOLCHAIN:START -->\n旧内容\n<!-- TOOLCHAIN:END -->\n后记\n";
  const out = spliceReadme(readme, "新内容");
  assert.match(out, /^前言\n/);
  assert.match(out, /新内容/);
  assert.ok(!out.includes("旧内容"));
  assert.match(out, /后记\n$/);
});

test("spliceReadme 缺少标记时抛错", () => {
  assert.throws(() => spliceReadme("无标记", "x"), /缺少 TOOLCHAIN 标记/);
});

test("buildSection 按分类顺序输出表格与时间口径说明", () => {
  const cfg = {
    categories: [
      { id: "a", name: "甲", tools: [{ name: "T1", repo: "a/b", description: "d1" }] },
      { id: "b", name: "乙", tools: [{ name: "T2", repo: "c/d", description: "d2", note: "备注" }] },
    ],
  };
  const results = new Map([["a/b", { relTime: "1 天前" }], ["c/d", { relTime: "2 天前" }]]);
  const section = buildSection(cfg, results, "2026-10-29 12:00");
  assert.ok(section.indexOf("### 甲") < section.indexOf("### 乙"));
  assert.match(section, /📌 备注/);
  assert.match(section, /2026-10-29 12:00/);
});

// ---------------------------------------------------------------------------
// 配置校验
// ---------------------------------------------------------------------------

const baseCfg = () => ({
  categories: [
    { id: "c", name: "C", tools: [{ name: "X", repo: "a/b", description: "d" }] },
  ],
});

test("validateConfig 接受最小合法配置并返回工具数", () => {
  assert.equal(validateConfig(baseCfg()), 1);
});

test("validateConfig 拒绝缺字段、重复仓库与重复工具名", () => {
  assert.throws(() => validateConfig({}), /categories/);
  assert.throws(() => validateConfig({ categories: [{ id: "c", name: "C", tools: [] }] }), /没有任何工具/);

  const dupRepo = baseCfg();
  dupRepo.categories[0].tools.push({ name: "Y", repo: "a/b", description: "d" });
  assert.throws(() => validateConfig(dupRepo), /重复追踪同一仓库/);

  const dupName = baseCfg();
  dupName.categories[0].tools.push({ name: "x", repo: "a/c", description: "d" });
  assert.throws(() => validateConfig(dupName), /工具名重复/);
});

test("validateConfig 拒绝会破坏 Markdown 表格的字符", () => {
  const bad = baseCfg();
  bad.categories[0].tools[0].description = "a | b";
  assert.throws(() => validateConfig(bad), /description 含非法字符/);

  const badNote = baseCfg();
  badNote.categories[0].tools[0].note = "x\ny";
  assert.throws(() => validateConfig(badNote), /note 含非法字符/);

  const badName = baseCfg();
  badName.categories[0].name = "C|D";
  assert.throws(() => validateConfig(badName), /非法字符/);
});

test("validateConfig 拒绝未知字段（防拼写错误静默失效）", () => {
  const cfg = baseCfg();
  cfg.categories[0].tools[0].tag_prefx = "v1";
  assert.throws(() => validateConfig(cfg), /未知字段 tag_prefx/);
});

test("validateConfig 强制 endpoint 模式必须带 tag_prefix", () => {
  const cfg = baseCfg();
  cfg.categories[0].tools[0].badge = "endpoint";
  assert.throws(() => validateConfig(cfg), /必须配置 tag_prefix/);
  cfg.categories[0].tools[0].tag_prefix = "v3";
  assert.equal(validateConfig(cfg), 1);
});

test("validateConfig 拒绝非法 badge / include_prereleases / tag_prefix", () => {
  const badBadge = baseCfg();
  badBadge.categories[0].tools[0].badge = "releases";
  assert.throws(() => validateConfig(badBadge), /badge 仅支持/);

  const badBool = baseCfg();
  badBool.categories[0].tools[0].include_prereleases = "yes";
  assert.throws(() => validateConfig(badBool), /必须为 true \/ false/);

  const badPrefix = baseCfg();
  badPrefix.categories[0].tools[0].tag_prefix = "a b";
  assert.throws(() => validateConfig(badPrefix), /tag_prefix 不能含/);
});

// ---------------------------------------------------------------------------
// 并发与重试
// ---------------------------------------------------------------------------

test("mapLimit 保持结果顺序且不超过并发上限", async () => {
  let active = 0;
  let peak = 0;
  const items = [1, 2, 3, 4, 5, 6, 7];
  const out = await mapLimit(items, 3, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return n * 2;
  });
  assert.deepEqual(out, items.map((n) => n * 2));
  assert.ok(peak <= 3, `并发峰值 ${peak} 不应超过 3`);
  assert.ok(peak > 1, "应实际并发执行");
});

test("mapLimit 处理空数组与超限并发参数", async () => {
  assert.deepEqual(await mapLimit([], 3, async (x) => x), []);
  const out = await mapLimit([1, 2], 99, async (x) => x + 1);
  assert.deepEqual(out, [2, 3]);
});

test("resolveConcurrency 按认证状态给默认值，并限制在 1-8", () => {
  assert.equal(resolveConcurrency(undefined, true), 4);
  assert.equal(resolveConcurrency(undefined, false), 2, "未认证配额只有 60 次/小时，默认并发应更低");
  assert.equal(resolveConcurrency("2", true), 2);
  assert.equal(resolveConcurrency("99", true), 8);
  assert.equal(resolveConcurrency("0", true), 4);
  assert.equal(resolveConcurrency("abc", false), 2);
  assert.equal(resolveConcurrency("", true), 4);
});

test("isRetryable 只认瞬时故障", () => {
  assert.equal(isRetryable({ status: 503 }), true);
  assert.equal(isRetryable({ status: 429 }), false);
  assert.equal(isRetryable({ status: 404 }), false);
  assert.equal(isRetryable(Object.assign(new Error("net"), { cause: { code: "ECONNRESET" } })), true);
  assert.equal(isRetryable(new Error("plain")), false);
});

test("withRetry 对瞬时错误重试并在成功后返回", async () => {
  let calls = 0;
  const retries = [];
  const value = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error("boom"), { status: 502 });
      return "ok";
    },
    { attempts: 3, baseDelayMs: 1, onRetry: (_e, a) => retries.push(a) },
  );
  assert.equal(value, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(retries, [1, 2]);
});

test("withRetry 对不可重试错误立即失败，且耗尽后抛出最后一个错误", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls++; throw Object.assign(new Error("nf"), { status: 404 }); }, { baseDelayMs: 1 }),
    /nf/,
  );
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(
    withRetry(async () => { calls++; throw Object.assign(new Error("down"), { status: 500 }); }, { attempts: 2, baseDelayMs: 1 }),
    /down/,
  );
  assert.equal(calls, 2);
});

// ---------------------------------------------------------------------------
// 快照回退：抓取失败时不能让整行退化成 "—"
// ---------------------------------------------------------------------------

test("loadPreviousSnapshot 读取上次快照，文件缺失或损坏时返回空表", () => {
  const tmp = join(mkdtempSync(join(tmpdir(), "adtr-")), "releases.json");
  assert.equal(loadPreviousSnapshot(tmp).size, 0, "文件不存在时应返回空表");

  writeFileSync(tmp, "{ not json");
  assert.equal(loadPreviousSnapshot(tmp).size, 0, "损坏的 JSON 不应抛出");

  writeFileSync(
    tmp,
    JSON.stringify({
      tools: [
        { repo: "a/b", tag: "v1.2.3", published_at: "2026-10-01T00:00:00Z", release_url: "https://x" },
        { repo: "c/d", tag: null },
      ],
    }),
  );
  const map = loadPreviousSnapshot(tmp);
  assert.equal(map.get("a/b").tag, "v1.2.3");
  assert.equal(map.get("a/b").publishedAt, "2026-10-01T00:00:00Z");
  assert.equal(map.get("c/d").tag, null);
  rmSync(dirname(tmp), { recursive: true, force: true });
});
