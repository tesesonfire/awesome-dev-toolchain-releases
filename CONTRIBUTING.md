# 贡献指南

欢迎新增或修正被追踪的开发工具。本仓库的核心约定：

> **版本号永远不出现在手工编辑的文本里。** 版本由 Shields.io 徽章实时渲染；"最近发布时间"由 GitHub Actions 每 12 小时抓取 GitHub API 后写入。README 中 `<!-- TOOLCHAIN:START -->` 与 `<!-- TOOLCHAIN:END -->` 之间的表格区块由脚本生成，**请勿手工编辑**。

## 新增一个被追踪工具

### 1. 编辑 `config/tools.yaml`

在合适的分类（`categories[*].tools`）下追加一个条目：

```yaml
categories:
  - id: cli                        # 已存在的分类直接往里加
    name: 通用 CLI
    tools:
      # ...已有条目...
      - name: eza                  # 显示名称（必填）
        repo: eza-community/eza    # GitHub owner/repo（必填）
        description: ls 的高级替代品，带颜色与图标。   # 一句话简介（必填）
        # ---- 以下全部为可选字段 ----
        # badge: release           # release（默认）/ tag / endpoint，见下文"徽章模式"
        # tag_prefix: v3           # badge 为 tag / endpoint 时，按前缀过滤 refs（避免历史 tag 干扰）
        # include_prereleases: true # 默认 false；仅当项目没有稳定版本、只发预发布时开启
        # note: 主要分发渠道为 xx   # 显示在简介下方的备注
```

字段说明：

| 字段 | 必填 | 说明 |
| :-- | :--: | :-- |
| `name` | ✅ | 表格中显示的工具名 |
| `repo` | ✅ | `owner/repo`，须与 GitHub 仓库路径完全一致 |
| `description` | ✅ | 一句话简介（不要包含 `\|` 字符与 `#`） |
| `badge` | ❌ | 徽章模式，默认 `release`，详见下文 |
| `tag_prefix` | ❌ | tag/endpoint 模式下按前缀过滤 refs，如 `go1`、`v3` |
| `include_prereleases` | ❌ | `true` 时把预发布纳入"最新版本"计算，默认排除 |
| `note` | ❌ | 特殊说明（如主分发渠道不在 GitHub），会显示在简介下方 |

### 2. 选择徽章模式（三种情况）

| 情况 | `badge` 取值 | 徽章 URL 模板 |
| :-- | :-- | :-- |
| 项目有正常的 GitHub Releases（绝大多数） | `release`（或不写） | `https://img.shields.io/github/v/release/{owner}/{repo}?sort=semver&display_name=tag` |
| 项目只有 tags、没有 Releases，且最新稳定 tag 能被 Shields 正确解析 | `tag` | `https://img.shields.io/github/v/tag/{owner}/{repo}?sort=semver&display_name=tag` |
| 项目只有 tags，且 Shields 自带端点无法排除预发布 tag（如 python/cpython） | `endpoint` | 由脚本生成 `data/badges/{owner-repo}.json`，经 `https://img.shields.io/endpoint?url=…` 渲染 |

注意：

- `sort=semver` 是**必需**参数，不可省略（避免 GitHub 把最新日期的旧版本分支当作 Latest）；
- 新增前请先在 `https://github.com/{owner}/{repo}/releases`（或 `/tags`）确认项目的发布形态，再选择对应模式；
- 若 Shields 对某个确实存在的仓库返回 `repository not found` 或明显错误的版本，请在条目 `note` 中说明并提 Issue 讨论降级方案，不要反复猜测 URL。

### 3. 重新生成 README 表格并提交

```bash
export GITHUB_TOKEN=ghp_xxx                 # 可选，提升 API 限额
node scripts/update_releases.mjs --dry-run  # 预览报告
node scripts/update_releases.mjs            # 写入 README + data/
git add config/tools.yaml README.md data
git commit -m "feat(tools): track eza"
git push
```

也可以**不本地运行**：PR 合并到 main 后，push 事件（匹配 `config/tools.yaml`）或下一次定时任务会自动重新生成表格并提交。

## 修改或移除一个工具

- **修改**：直接改 `config/tools.yaml` 对应字段，重新生成表格；
- **移除**：删除对应条目即可，脚本会同步删除表格中的行；
- 表格的分类顺序、分类名都由 `categories` 的顺序与 `name` 字段决定。

## 设计约定（给 review 者的检查清单）

1. README 中除标记区块外的内容可以手工编辑；标记区块内的一切以 `config/tools.yaml` + GitHub API 为准；
2. 版本数据只允许来自 GitHub Releases / Tags API 与 Shields.io 对应端点，不引入第三方聚合数据；
3. "最近发布"的相对时间口径由 `scripts/update_releases.mjs` 的 `relTime()` 统一实现（24 小时内 / N 天前 / MM-DD）；
4. Actions 工作流保持单文件、少量步骤；复杂逻辑全部收敛在脚本中，便于本地复现；
5. 对无 GitHub Releases 的工具，条目必须带 `note` 说明降级方式，不得用 GitHub 数据冒充其官方发布渠道（如 conda 的 anaconda.org）。
