# awesome-dev-toolchain-releases

[![Update release data](https://github.com/tesesonfire/awesome-dev-toolchain-releases/actions/workflows/update-releases.yml/badge.svg)](https://github.com/tesesonfire/awesome-dev-toolchain-releases/actions/workflows/update-releases.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

集中追踪主流开发工具链的最新 Release 版本与发布时间：Rust、Go、Python、Node.js、uv、conda、nvm、nvm-windows、GitHub CLI、ripgrep、jq、yq 等。

> **本仓库所有版本信息均由自动化机制产出，不接受人工维护版本号。**
>
> - **版本号**：由 [Shields.io](https://shields.io) 动态徽章实时渲染（数据源为 GitHub Releases / Tags，带 `sort=semver`），对应项目发布新版本后即可自动反映；
> - **最近发布时间**：由 GitHub Actions 定时任务（每 12 小时）调用 GitHub Releases API 计算并写入本页；
> - **工具清单**：集中管理在 [`config/tools.yaml`](config/tools.yaml)，README 表格由脚本自动生成。

## ✨ 特性

- 🔴 **实时版本徽章** —— 徽章直接向 Shields.io 请求渲染，新 Release 发布后随徽章缓存（约 1 小时）自动更新，远快于 24 小时要求；
- 🕐 **定时发布时间刷新** —— Actions 每 12 小时抓取全部追踪仓库，重写表格中的"最近发布"列并提交；
- 🧩 **单一配置源** —— 新增 / 删除工具只需修改 `config/tools.yaml`，表格结构由脚本维护，README 无需手工编辑；
- 📦 **数据留痕** —— 每次抓取的版本快照存档于 [`data/releases.json`](data/releases.json)，可在提交历史中回溯。

## 📊 工具列表

<!-- TOOLCHAIN:START -->
<!-- 本区块由 scripts/update_releases.mjs 依据 config/tools.yaml 自动生成；请勿手工编辑 -->

### 语言运行时

| 工具 | 最新版本 | 最近发布 | 仓库 | 简介 |
| :-- | :-- | :--: | :-- | :-- |
| [Rust](https://github.com/rust-lang/rust) | [![Rust latest version](https://img.shields.io/github/v/release/rust-lang/rust?sort=semver&display_name=tag)](https://github.com/rust-lang/rust/releases) | `11 天前` | [`rust-lang/rust`](https://github.com/rust-lang/rust) | 系统级编程语言，注重性能、可靠性与内存安全。 |
| [Go](https://github.com/golang/go) | [![Go latest version](https://img.shields.io/github/v/tag/golang/go?sort=semver&display_name=tag)](https://github.com/golang/go/tags) | `7 天前` | [`golang/go`](https://github.com/golang/go) | Google 开源的静态类型编译型语言。 <br>📌 该项目不发布 GitHub Releases（仅 tags），徽章基于 tag 渲染 |
| [Python](https://github.com/python/cpython) | [![Python latest version](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Ftesesonfire%2Fawesome-dev-toolchain-releases%2Fmain%2Fdata%2Fbadges%2Fpython-cpython.json)](https://github.com/python/cpython/tags) | `2 天前` | [`python/cpython`](https://github.com/python/cpython) | CPython 解释器，Python 语言的官方参考实现。 <br>📌 主要分发渠道为 python.org；GitHub 上无 Releases（仅 tags），徽章由本仓库 Actions 依据最新稳定 tag 生成 |
| [Node.js](https://github.com/nodejs/node) | [![Node.js latest version](https://img.shields.io/github/v/release/nodejs/node?sort=semver&display_name=tag)](https://github.com/nodejs/node/releases) | `6 天前` | [`nodejs/node`](https://github.com/nodejs/node) | 基于 V8 的 JavaScript 运行时。 |
| [Bun](https://github.com/oven-sh/bun) | [![Bun latest version](https://img.shields.io/github/v/release/oven-sh/bun?sort=semver&display_name=tag)](https://github.com/oven-sh/bun/releases) | `5 天前` | [`oven-sh/bun`](https://github.com/oven-sh/bun) | 一体化 JavaScript 运行时与工具链（运行、打包、测试、包管理）。 |
| [Deno](https://github.com/denoland/deno) | [![Deno latest version](https://img.shields.io/github/v/release/denoland/deno?sort=semver&display_name=tag)](https://github.com/denoland/deno/releases) | `6 天前` | [`denoland/deno`](https://github.com/denoland/deno) | 默认安全的 JavaScript / TypeScript 运行时。 |

### Python 工具链

| 工具 | 最新版本 | 最近发布 | 仓库 | 简介 |
| :-- | :-- | :--: | :-- | :-- |
| [uv](https://github.com/astral-sh/uv) | [![uv latest version](https://img.shields.io/github/v/release/astral-sh/uv?sort=semver&display_name=tag)](https://github.com/astral-sh/uv/releases) | `24 小时内` | [`astral-sh/uv`](https://github.com/astral-sh/uv) | Rust 编写的高速 Python 包与项目管理器。 |
| [conda](https://github.com/conda/conda) | [![conda latest version](https://img.shields.io/github/v/release/conda/conda?sort=semver&display_name=tag)](https://github.com/conda/conda/releases) | `6 天前` | [`conda/conda`](https://github.com/conda/conda) | 跨语言、跨平台的包与环境管理器。 <br>📌 主分发渠道为 anaconda.org；本条目追踪其 GitHub Releases 作为版本参考 |

### 版本管理器

| 工具 | 最新版本 | 最近发布 | 仓库 | 简介 |
| :-- | :-- | :--: | :-- | :-- |
| [nvm](https://github.com/nvm-sh/nvm) | [![nvm latest version](https://img.shields.io/github/v/release/nvm-sh/nvm?sort=semver&display_name=tag)](https://github.com/nvm-sh/nvm/releases) | `09-21` | [`nvm-sh/nvm`](https://github.com/nvm-sh/nvm) | POSIX（sh/bash/zsh）环境下的 Node.js 版本管理器。 |
| [nvm-windows](https://github.com/coreybutler/nvm-windows) | [![nvm-windows latest version](https://img.shields.io/github/v/release/coreybutler/nvm-windows?sort=semver&display_name=tag)](https://github.com/coreybutler/nvm-windows/releases) | `24 天前` | [`coreybutler/nvm-windows`](https://github.com/coreybutler/nvm-windows) | Windows 下的 Node.js 版本管理器（与 nvm-sh 相互独立的实现）。 <br>📌 Windows 原生版本，管理工具为 nvm.exe / nvm-no.exe |

### GitHub 生态

| 工具 | 最新版本 | 最近发布 | 仓库 | 简介 |
| :-- | :-- | :--: | :-- | :-- |
| [GitHub CLI](https://github.com/cli/cli) | [![GitHub CLI latest version](https://img.shields.io/github/v/release/cli/cli?sort=semver&display_name=tag)](https://github.com/cli/cli/releases) | `24 小时内` | [`cli/cli`](https://github.com/cli/cli) | GitHub 官方命令行工具 gh，覆盖 PR、Issue、Actions 等工作流。 |

### 通用 CLI

| 工具 | 最新版本 | 最近发布 | 仓库 | 简介 |
| :-- | :-- | :--: | :-- | :-- |
| [ripgrep](https://github.com/BurntSushi/ripgrep) | [![ripgrep latest version](https://img.shields.io/github/v/release/BurntSushi/ripgrep?sort=semver&display_name=tag)](https://github.com/BurntSushi/ripgrep/releases) | `07-15` | [`BurntSushi/ripgrep`](https://github.com/BurntSushi/ripgrep) | 面向目录递归的高速正则搜索工具（rg）。 |
| [fd](https://github.com/sharkdp/fd) | [![fd latest version](https://img.shields.io/github/v/release/sharkdp/fd?sort=semver&display_name=tag)](https://github.com/sharkdp/fd/releases) | `08-26` | [`sharkdp/fd`](https://github.com/sharkdp/fd) | 简单、快速的 find 替代品。 |
| [bat](https://github.com/sharkdp/bat) | [![bat latest version](https://img.shields.io/github/v/release/sharkdp/bat?sort=semver&display_name=tag)](https://github.com/sharkdp/bat/releases) | `2025-12-02` | [`sharkdp/bat`](https://github.com/sharkdp/bat) | 带语法高亮与 Git 集成的 cat 克隆。 |
| [jq](https://github.com/jqlang/jq) | [![jq latest version](https://img.shields.io/github/v/release/jqlang/jq?sort=semver&display_name=tag)](https://github.com/jqlang/jq/releases) | `06-20` | [`jqlang/jq`](https://github.com/jqlang/jq) | 轻量级命令行 JSON 处理器。 |
| [yq](https://github.com/mikefarah/yq) | [![yq latest version](https://img.shields.io/github/v/release/mikefarah/yq?sort=semver&display_name=tag)](https://github.com/mikefarah/yq/releases) | `28 天前` | [`mikefarah/yq`](https://github.com/mikefarah/yq) | 命令行 YAML / XML / CSV 处理器（Go 实现）。 |
| [fzf](https://github.com/junegunn/fzf) | [![fzf latest version](https://img.shields.io/github/v/release/junegunn/fzf?sort=semver&display_name=tag)](https://github.com/junegunn/fzf/releases) | `16 天前` | [`junegunn/fzf`](https://github.com/junegunn/fzf) | 通用命令行模糊搜索器，可对接任意列表输入。 |

> 🕒 数据更新时间（UTC）：**2026-10-27 18:52** · 由 [update-releases workflow](.github/workflows/update-releases.yml) 每 12 小时刷新；版本徽章由 Shields.io 实时渲染，不受本页缓存影响。
>
> 时间口径：24 小时内 → `24 小时内`；30 天内 → `N 天前`；更早 → `MM-DD`（跨年显示 `YYYY-MM-DD`）。
> “最新版本”为 semver 排序最高的稳定版本（不含预发布）。无 GitHub Releases 的工具（Go、Python）基于最新稳定 tag，时间为该 tag 的打标/提交时间。
<!-- TOOLCHAIN:END -->

## 🧭 数据口径与说明

- **数据源**：GitHub Releases API（`api.github.com`）与 Shields.io 的 GitHub Release / Tag 端点，均为权威源；不使用任何第三方聚合站数据。
- **"最新版本"定义**：按 semver 排序取最高的**非草稿、非预发布**版本，与徽章 URL 中 `sort=semver` 的口径保持一致。
- **时间格式**：24 小时内 → `24 小时内`；30 天内 → `N 天前`；更早 → `MM-DD`（跨年显示 `YYYY-MM-DD`），按 `published_at`（UTC）计算。
- **展示风格差异**：Shields.io 会对无 `v` 前缀的 tag 统一渲染为 `v` 前缀（如 ripgrep 的 tag `15.2.0` 显示为 `v15.2.0`），仅为展示风格差异，版本号与最新 Release 一致。

### 已知特例与降级方案

| 工具 | 情况 | 处理方式 |
| :-- | :-- | :-- |
| Go（golang/go） | 不发布 GitHub Releases，仅维护 tags | 徽章降级为 Shields tag 端点（`/github/v/tag/…?sort=semver`）；时间为最新稳定 tag 的提交时间 |
| Python（python/cpython） | 不发布 GitHub Releases，仅维护 tags；主要分发渠道为 python.org | 徽章由本仓库 Actions 依据最新稳定 tag 生成 JSON，经 Shields `/endpoint` 端点渲染（Shields 自带 tag 端点无法排除预发布 tag，且 `filter` 参数实测无效，故降级） |
| conda | 主分发渠道为 anaconda.org | 其 GitHub Releases 正常存在且持续更新，直接追踪 GitHub Releases 作为版本参考 |

## 🛠️ 本地运行

依赖：Node.js ≥ 18（零第三方依赖）。

```bash
# 可选：设置 GITHUB_TOKEN 提升限额（未认证 60 次/小时，认证后 5000 次/小时）
export GITHUB_TOKEN=ghp_xxx

node scripts/update_releases.mjs --dry-run   # 仅打印报告，不写文件
node scripts/update_releases.mjs             # 重新生成 README 表格、data/releases.json、data/badges/*
```

## ➕ 新增追踪工具

见 [CONTRIBUTING.md](CONTRIBUTING.md) —— 只需在 `config/tools.yaml` 中添加一个条目并提交，CI 会自动重建 README 表格；文档同时说明了无 GitHub Releases 工具的降级模板。

## 📄 License

[MIT](LICENSE)
