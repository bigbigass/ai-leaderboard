我先核实几个关键事实（数据源许可、Vercel/数据库免费额度），再给出完整设计。# AI 评测榜单聚合站 MVP 架构设计（v1，面向 Claude Code 实现）

> 阅读说明：标注 **【需核实】** 的地方是我无法在本次联网中 100% 确认、或信息源之间有冲突的结论，建议你在开工前花 30 分钟逐条确认。其余为可直接实施的设计。

---

## 0. 先复核你的数据源合规假设（有两处需要修正）

| 数据源 | 你的理解 | 复核结果 | 对 MVP 的影响 |
|---|---|---|---|
| **LMArena** 官方 HF 数据集 | 可用 | ✅ 基本成立。数据集 `lmarena-ai/leaderboard-dataset` 的 schema 包含 model_name、organization、license、rating（Arena Score）、rating_lower / rating_upper（置信区间）、variance、vote_count、rank、category 以及 leaderboard_publish_date（该分数发布日期）。第三方引用称其为 CC-BY-4.0，需署名。**【需核实】** HF 页面上 License 字段在我抓到的快照里为空，请打开数据集卡片确认许可证字样。 | 🎁 **重大利好**：有 `leaderboard_publish_date`，意味着「历史趋势」功能可以**第一天就回填全部历史**，不用等快照积累。另外 Search / Webdev Arena 数据分别从 2025-08-07、2025-11-12 起，Agent Arena 从 2026-06-04 起。 |
| **Epoch AI** | 需署名 | ✅ 成立，但有一个细节：Epoch 的数据在 CC BY 下可自由使用、分发、复制，前提是注明来源和作者；然而 该 hub 也包含来自外部项目的数据，这些数据保留其原始许可，使用者需自行遵守具体数据的许可条款并按指示注明原始来源。 | 入库时必须保留 Epoch 的 `Source` / `Source link` 列，按行区分「Epoch 自测」与「外部来源」。数据可通过 CSV 下载、交互工具或 Epoch AI Python 客户端获取。 |
| **Artificial Analysis** | 禁止抓取，不能用 | ⚠️ **需要修正表述**：不是"不能用"，而是"免费层不能用于公开展示"。AA 现在有官方免费 API，所有免费 API 使用都要求署名，但其定价页明确：免费 API 的再分发权限为"仅限内部使用并署名"，Pro API 为"受限的外部使用"，Commercial API 才是"可商业再分发并署名"。 | 聚合站属于公开再分发 → **MVP 不接入 AA**，但在代码里预留 adapter，未来谈 Commercial 套餐再开。**【需核实】** 限速信息有冲突：一处说 每天 1,000 次请求，另一处 Data API 文档写 Free 层每窗口 100 次。 |
| **OpenRouter** | 可用（API / 排名） | ⚠️ 部分成立。`GET /api/v1/models` 是公开的、无需 key，可拿模型元数据、定价、上下文长度——这部分没问题。**但「排名（Rankings）」页的 token 用量数据我未能确认有官方文档化的公开 API**。**【需核实】** 查 OpenRouter 文档是否有 rankings endpoint；若没有，不要抓网页 HTML，先只用 models 端点。 | OpenRouter 在本设计里定位为「模型元数据 + 价格 + （若有官方接口）使用热度」，**不是评测分数源**。 |
| **LiveBench** | 可用 | **【需核实】** 我本次没有搜到许可证页面。我的记忆是代码 Apache-2.0、题目数据放在 HF、榜单结果 JSON/CSV 在 GitHub 仓库可直接拉；请确认 (a) 结果文件的确切路径，(b) 结果数据的许可（README 或 LICENSE）。 | 若许可不明，发邮件询问，模板见第 9 节。 |
| **OpenCompass / SuperCLUE** | 需确认许可 | ✅ 同意。OpenCompass 代码 Apache-2.0，但 CompassRank 榜单数据的再分发许可不明确；SuperCLUE 是商业机构运营，公开 README 表格不等于授权再分发。 | MVP 阶段：**不入库**，只在模型页提供「在 OpenCompass / SuperCLUE 查看」外链 + 发邮件申请。获得书面许可后再接 adapter。 |

**中国模型覆盖的现实问题**：上述合规源里，LMArena 是唯一把国产模型与海外模型放在同一尺度上、且有语言分类（如 Chinese 类别）的——**【需核实】** 该 HF 数据集的 `category` 列是否含 `chinese`。这会成为你 MVP 阶段"国产模型"差异化的主数据。另一个合规补充源是**厂商自报分数**（模型卡 / 技术报告里的 benchmark 表），事实性数据引用并注明"厂商自报"一般没有许可问题，但要在 UI 上与第三方评测明确区分。

---

## 1. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui** | 你的现有栈；RSC 适合数据密集的 SSG 页面 |
| 数据库 | **Neon Postgres**（免费层） | Serverless、scale-to-zero、有分支功能便于 Claude Code 跑迁移测试。备选 Supabase。**【需核实】** 当前免费层存储配额（我记忆为 0.5 GB 级别），本项目 1 年数据量估算 < 200 MB，够用 |
| ORM | **Drizzle ORM + drizzle-kit** | schema 即 TypeScript 代码，SQL 透明，Claude Code 生成的迁移可读可审 |
| 数据管道运行时 | **GitHub Actions**（不是 Vercel Cron） | 见下方说明 |
| 渲染 | **SSG + ISR + 按需 revalidateTag** | 全站可静态化；管道跑完后 webhook 触发 revalidate |
| 缓存 | Next.js Data Cache；**MVP 不引 Redis** | 需要限流时再上 Upstash Redis 免费层 |
| i18n | **next-intl** | App Router 原生支持、`[locale]` 路由、`generateMetadata` 里生成 hreflang 方便 |
| 内容 | MDX（周报）存仓库 `content/weekly/*.mdx`，翻译结果存 DB | Git 即 CMS，无需后台 |
| 图表 | Recharts（客户端）或 服务端生成 SVG（更利 SEO/性能） | 趋势图建议服务端 SVG，无 JS 也能看 |
| 校验 | zod | 每个 adapter 输出严格 schema |
| 监控 | Sentry 免费层 + Telegram Bot 告警 | 零成本 |
| 分析 | Cloudflare Web Analytics / Umami | 无 cookie，省去部分 GDPR 麻烦 |
| LLM 翻译 | DeepSeek-V3 或 Gemini Flash API | 周报翻译量极小 |

### 为什么管道放 GitHub Actions 而不是 Vercel Cron

Vercel Hobby 的 cron 限制很紧：Hobby 上 Vercel Cron 最多每天一次、仅保证在整点小时内触发、仅 UTC，且每次修改频率都要重新部署。而且 没有失败重试、没有失败告警。数量上限信息有冲突（**【需核实】**）：一说 2026 年 1 月起所有套餐每项目上限提到 100 个，另一说 每项目只有 2 个。无论哪种，"每天一次 + 无重试 + 函数时长受限"都不适合跑多源抓取。

GitHub Actions 优势：免费（公开仓库不限分钟、私有仓库 2000 分钟/月）、单 job 可跑 6 小时、有日志、可手动重跑、可配 `workflow_dispatch`。管道脚本直接连 Neon 写库，跑完 `POST https://你的域名/api/revalidate` 触发 ISR 刷新。Vercel Cron 只留一个每日兜底 `0 6 * * *` 调 `/api/cron/daily`（检查快照新鲜度、兜底 revalidate）。

### 渲染策略

```
页面类型           策略                                   revalidate
首页/榜单页/hub页   SSG（build 时生成）+ tag 刷新           86400 + on-demand
模型页 top 300     generateStaticParams 预生成              86400 + on-demand
模型页其余         dynamicParams=true，首次访问生成后缓存    86400
对比页 (2 模型)    预生成"热门对"（见第 4 节），其余按需       86400
周报页             SSG                                     不变，发布时 revalidate
/api/v1/*          动态，Edge/Node 函数，Cache-Control 公共缓存 1h
```

### 成本估算（月）

| 项 | 费用 |
|---|---|
| 域名 | ~¥70/年 |
| Vercel Hobby | ¥0 —— **但注意** Hobby 免费无过期，商业用途需 Pro（$20/月）。一旦上 Pro 订阅/广告/付费 API，必须升级 Pro |
| Neon 免费层 | ¥0 |
| GitHub Actions | ¥0 |
| LLM 翻译 | < ¥5 |
| Sentry / Telegram / Cloudflare Analytics | ¥0 |
| **MVP 合计** | **≈ ¥0–5/月**；变现后 ≈ $20/月 |

---

## 2. 数据管道

### 2.1 目录结构（给 Claude Code 的模块边界）

```
/pipeline                      # 独立 Node 包，不依赖 Next.js
  /adapters
    base.ts                    # Adapter 接口 + 公共 fetch/retry/hash
    lmarena.ts
    livebench.ts
    epoch.ts
    openrouter.ts
    artificial-analysis.ts     # stub，enabled=false
    opencompass.ts             # stub，enabled=false
    superclue.ts               # stub，enabled=false
    vendor-reported.ts         # 读 /data/vendor-reported/*.yaml
  /normalize
    categories.ts              # 源类别 → 统一分类
    scores.ts                  # 分数类型、百分位
    identity/
      aliases.yaml             # 人工维护的别名表（Git 审核）
      rules.ts                 # 规范化规则
      matcher.ts               # 精确 → 规则 → 模糊 → 待审
  /compute
    summaries.ts               # 跨榜单汇总 + 分歧
    history.ts                 # 日粒度序列
  /validate
    checks.ts                  # 新鲜度/行数/重叠度检查
  /alerts
    telegram.ts
  run.ts                       # CLI: pnpm pipeline ingest --source lmarena
/apps/web                      # Next.js
/packages/db                   # Drizzle schema + 迁移，web 与 pipeline 共用
```

**Adapter 接口**（每个数据源只需实现这一个）：

```ts
interface SourceAdapter {
  slug: string;
  fetch(): Promise<RawPayload>;                 // 拉原始数据
  parse(raw: RawPayload): ParsedLeaderboard[];  // → 统一中间结构，zod 校验
}
interface ParsedLeaderboard {
  leaderboardSlug: string;      // e.g. "lmarena-text-overall"
  categoryRaw: string;
  publishedAt: string;          // 源声明日期，ISO
  scoreType: 'elo' | 'percent' | 'index' | 'rank_only' | 'tokens';
  rows: { rawName: string; rawOrg?: string; rank?: number; score?: number;
          scoreLower?: number; scoreUpper?: number; votes?: number;
          extra?: Record<string, unknown> }[];
}
```

### 2.2 各源拉取方式与频率

| 源 | 方式 | 频率 | 幂等/去重 |
|---|---|---|---|
| LMArena | HF parquet：`https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/parquet/{config}/full` 下载后用 `parquet-wasm` 或 `hyparquet` 解析；configs：`text`、`text_style_control`、`vision`、`webdev`、`search`、`agent`（**【需核实】** 具体 config 名） |


# AI 评测榜单聚合站 MVP 架构设计（v1，续：2.2 节起）

> 续写说明：以下接着上一部分的 2.2 表格继续。编号、表名、目录与前文保持一致；第 3 节「数据库 Schema」上一部分尚未写到，这里一并补上（后面的页面、API、任务都依赖它）。**【需核实】** 标注规则同前。

---

### 2.2 各源拉取方式与频率（续）

| 源 | 方式 | 频率 | 幂等/去重 |
|---|---|---|---|
| LMArena（续） | 每个 config 解析后按 `category × leaderboard_publish_date` 分组，**每组生成一个历史 snapshot**（首跑即回填全部历史）。 | 每日 1 次（数据集实际约每周更新） | 以 `(leaderboard_slug, published_at, sha256(rows))` 判重；同日同哈希跳过 |
| LiveBench | 拉 GitHub 仓库中的结果文件（**【需核实】** 路径，我记忆为 `LiveBench/livebench` 仓库的 `leaderboard/` 或 Hugging Face `livebench/*` 结果；按类别 Reasoning/Coding/Math/Data Analysis/Language/IF + Global Average），用 raw.githubusercontent 直链 | 每日 1 次（实际约月更，换题时分数整体重置 → 见 2.3 「批次」） | 文件 `ETag`/commit sha 变化才入库；`published_at` = 该文件最后一次 commit 日期 |
| Epoch AI | 下载 Benchmarking Hub CSV（**【需核实】** 直链 URL，可用其 Python 客户端对应的下载地址）；只取 `Source` 为 Epoch 自测的行入 `leaderboard_entries`，外部来源行入库时 `redistributable=false`，仅在站内展示并带原始出处链接，**不进 API/导出** | 每周 1 次 | 按 benchmark 名分 leaderboard（`epoch-gpqa-diamond`、`epoch-frontiermath` 等）；每行自带评测日期 |
| OpenRouter | `GET https://openrouter.ai/api/v1/models`（无需 key）→ 写入 `model_meta`（价格、上下文、模态、`created`）；**不作为榜单** | 每日 1 次 | 全量 upsert，`seen_at` 更新 |
| 厂商自报 | 仓库内 `data/vendor-reported/{vendor}/{model}.yaml`，人工从模型卡/技术报告抄录，字段：benchmark、score、source_url、reported_at | 文件变更时触发（GitHub Actions `on: push: paths`） | leaderboard slug 固定为 `vendor-reported-{benchmark}`，`score_type='percent'`，UI 标「厂商自报」 |
| AA / OpenCompass / SuperCLUE | stub，`enabled=false`，`fetch()` 抛 `NotEnabledError` | — | — |

### 2.3 数据标准化

**分数尺度（原则：不跨类型换算，只在"同一 leaderboard 内"做百分位）**

| `score_type` | 来源 | 存储 | 展示 |
|---|---|---|---|
| `elo` | LMArena | 原值 + 上下界 | `1423 (±8)` |
| `percent` | LiveBench、Epoch、厂商自报 | 0–100 | `72.3%` |
| `index` | 预留（AA 等） | 原值 | — |
| `rank_only` | 只有名次没有分数的源 | score=null | `#3` |

每个 snapshot 入库后计算 `percentile`（0–100，`100 = 第一名`）= `(N - rank + 1) / N × 100`，只统计**已匹配到 canonical model** 的行，使不同"参赛池"大小的榜单可比。跨榜单比较一律用 percentile，**绝不把 Elo 和 % 平均**。

**类别统一表**（`pipeline/normalize/categories.ts`，源类别 → 统一类别）：

```ts
export const CATEGORY_MAP: Record<string, UnifiedCategory> = {
  'lmarena:text:overall': 'overall',
  'lmarena:text:coding': 'coding',
  'lmarena:text:math': 'math',
  'lmarena:text:chinese': 'chinese',        // 【需核实】列值大小写/拼写
  'lmarena:webdev': 'coding',
  'lmarena:vision': 'vision',
  'livebench:global_average': 'overall',
  'livebench:coding': 'coding',
  'livebench:reasoning': 'reasoning',
  'livebench:mathematics': 'math',
  'epoch:gpqa_diamond': 'knowledge',
  'epoch:frontiermath': 'math',
  'epoch:swe_bench_verified': 'coding',
};
type UnifiedCategory = 'overall'|'coding'|'math'|'reasoning'|'knowledge'|'chinese'|'vision'|'agent'|'other';
```

未映射的源类别记 `other` 并告警（新类别出现时提醒你补表）。

**日期（三个日期字段必须分清）**：

| 字段 | 含义 | 用途 |
|---|---|---|
| `snapshots.published_at` | 源声明的榜单日期 | 历史趋势 X 轴 |
| `snapshots.captured_at` | 我们抓到的时间 | 新鲜度告警 |
| `models.released_at` | 模型发布日 | 模型页、"新模型"列表 |

**批次（batch）**：LiveBench 换题后分数系统性变化，不可跨批比较。`snapshots.batch_key` 记录题集版本（LiveBench 的 release date；LMArena 无需）；趋势图按 `batch_key` 分段绘制并标注"题集更新"。

### 2.4 跨数据源的模型身份映射（最关键、最费人工的模块）

**核心决策：两层身份**

- `models`（canonical）：厂商发布的一个**命名 checkpoint**。例：`deepseek-v3-0324`、`deepseek-r1-0528`、`qwen3-235b-a22b`、`kimi-k2-0711`、`glm-4.5`、`doubao-seed-1.6`、`minimax-m1`。
- `variant_key`（挂在每条 leaderboard entry 上，不单独建表）：同一 checkpoint 的**运行配置**，格式 `k=v;k=v`，键固定为 `reasoning`（`on|off|high|low`）、`style_control`（`on|off`）、`quant`、`provider`。默认 `""`。

例：LMArena 的 `qwen3-235b-a22b` 与 `qwen3-235b-a22b-no-thinking` → 同一 `model_id`，variant 分别为 `reasoning=on` / `reasoning=off`。模型页默认展示**每个榜单该模型的最佳 variant**，并列出全部 variant。

但 `deepseek-r1` 与 `deepseek-v3` 是**不同 model**（不同 checkpoint，不是开关）。判断口径写进 `aliases.yaml` 头部注释，供 Claude Code 和你自己遵守：*"同一权重 → 同一 model；不同权重 → 不同 model；思考开关/风格控制/部署方 → variant。"*

**canonical slug 规则**：`{family}-{version}[-{size}][-{date YYMM or MMDD}]`，全小写、连字符、不含厂商前缀、不含 `preview/exp/latest`。

**匹配流水线**（`matcher.ts`）：

```
输入 rawName, rawOrg, sourceSlug
1. 精确别名：aliases.yaml 中 (source, rawName) → model_slug + variant_key     ← 命中率目标 ≥ 90%
2. 规范化键：normalize(rawName) = 去厂商前缀(openai/、together/…) → 小写
   → 去括号内容 → 日期统一(2025-03-24 → 0324) → 提取变体词
   (thinking|reasoning|no-thinking|-think|high|low|exp|preview) 写入 variant
   → 与 models.normalized_key 精确比
3. 规则匹配：同 vendor 内，family+version+size 全同、仅日期缺失 → 匹配到该 family 最新 checkpoint，
   并打 confidence=0.8，写入 match_log
4. 模糊匹配：同 vendor 内 Jaro-Winkler ≥ 0.92 → 不自动采用，写入 unmatched_names 并附建议
5. 全部失败 → unmatched_names(status='pending')，该行 model_id=NULL，不出现在任何页面
```

`aliases.yaml` 格式：

```yaml
# 规则：同一权重=同一model；思考开关/风格控制=variant
- model: deepseek-v3-0324
  vendor: deepseek
  aliases:
    - { source: lmarena,    name: "deepseek-v3-0324" }
    - { source: livebench,  name: "deepseek-v3-0324" }
    - { source: openrouter, name: "deepseek/deepseek-chat-v3-0324" }
    - { source: epoch,      name: "DeepSeek-V3-0324" }
- model: qwen3-235b-a22b
  vendor: alibaba
  aliases:
    - { source: lmarena, name: "qwen3-235b-a22b",             variant: "reasoning=on" }
    - { source: lmarena, name: "qwen3-235b-a22b-no-thinking", variant: "reasoning=off" }
```

**人工审核闭环**：每次 ingest 结束，若有新的 `unmatched_names`，Telegram 推送一条含建议的消息；你在 `aliases.yaml` 里加几行 → push → Actions 重跑匹配（只重匹配 `model_id IS NULL` 的 entries，不重新抓取）。首次冷启动预计 150–250 个名字需要你人工过一遍（约 2 小时），之后每周 < 10 个。

**模型属性归一**：`vendors`表维护 `country`（用于"国产模型"筛选）、`models.open_weights`（bool，来自 LMArena license 列 / HF 模型卡）、`models.license`、`models.params_total / params_active`（MoE）、`models.modalities`。

### 2.5 汇总与分歧计算（`compute/summaries.ts`）

每次 compute 对每个 model 重算 `model_summaries`：

- `coverage`：出现在几个 leaderboard（按 `leaderboard_id` 去重，只算 `latest` snapshot）。
- `median_percentile`、`best_percentile`、`worst_percentile`。
- `disagreement_score` = `max(percentile) − min(percentile)`（0–100）。
- `disagreement_flag`：`coverage ≥ 3 AND disagreement_score ≥ 25` → `high`；`≥ 15` → `medium`；否则 `none`。阈值放 `config/thresholds.ts`。
- `disagreement_pair`：差异最大的两个 leaderboard slug，供 UI 写成「在 LiveBench 排第 4，在 LMArena 仅第 31」。
- `rank_delta_7d / 30d`：按 overall 类别、同一 leaderboard 的 `percentile` 与 7/30 天前最近 snapshot 比较。

只在**同一 unified category** 内计算分歧（overall 对 overall，coding 对 coding），避免"数学榜 vs 中文榜"的伪分歧。

---

## 3. 数据库 Schema（Drizzle，Postgres）

```sql
-- 维度表 ----------------------------------------------------------
CREATE TABLE vendors (
  id            serial PRIMARY KEY,
  slug          text UNIQUE NOT NULL,          -- 'deepseek','alibaba','moonshot','zhipu','bytedance','minimax','openai'...
  name          text NOT NULL,
  country       char(2) NOT NULL,              -- 'CN','US'...
  website       text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE models (
  id             serial PRIMARY KEY,
  slug           text UNIQUE NOT NULL,         -- canonical slug，URL 用
  normalized_key text UNIQUE NOT NULL,         -- 匹配用
  display_name   text NOT NULL,
  vendor_id      int REFERENCES vendors(id) NOT NULL,
  family         text NOT NULL,                -- 'deepseek-v3','qwen3'
  version        text,
  params_total   numeric, params_active numeric,
  open_weights   boolean,
  license        text,
  modalities     text[] DEFAULT '{text}',
  released_at    date,
  status         text DEFAULT 'active',        -- active|deprecated|hidden
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE INDEX models_vendor_idx ON models(vendor_id);
CREATE INDEX models_family_idx ON models(family);

CREATE TABLE model_aliases (                   -- 由 aliases.yaml 同步生成，DB 为只读镜像
  id          serial PRIMARY KEY,
  model_id    int REFERENCES models(id) ON DELETE CASCADE,
  source_slug text NOT NULL,
  raw_name    text NOT NULL,
  variant_key text NOT NULL DEFAULT '',
  UNIQUE(source_slug, raw_name)
);

CREATE TABLE sources (
  id          serial PRIMARY KEY,
  slug        text UNIQUE NOT NULL,            -- 'lmarena','livebench','epoch','openrouter','vendor-reported'
  name        text NOT NULL,
  homepage    text,
  license     text,                            -- 'CC-BY-4.0' 等
  attribution text NOT NULL,                   -- 页脚署名文案
  enabled     boolean DEFAULT true
);

CREATE TABLE leaderboards (
  id           serial PRIMARY KEY,
  slug         text UNIQUE NOT NULL,           -- 'lmarena-text-overall','livebench-coding','epoch-gpqa-diamond'
  source_id    int REFERENCES sources(id),
  name         text NOT NULL,
  category     text NOT NULL,                  -- UnifiedCategory
  category_raw text,
  score_type   text NOT NULL,                  -- elo|percent|index|rank_only
  higher_is_better boolean DEFAULT true,
  external_url text,
  description  text
);

-- 事实表 ----------------------------------------------------------
CREATE TABLE snapshots (
  id            bigserial PRIMARY KEY,
  leaderboard_id int REFERENCES leaderboards(id),
  published_at  date NOT NULL,
  captured_at   timestamptz DEFAULT now(),
  batch_key     text,
  content_hash  text NOT NULL,
  row_count     int NOT NULL,
  matched_count int NOT NULL,
  status        text DEFAULT 'ok',             -- ok|rejected|superseded
  is_latest     boolean DEFAULT false,
  UNIQUE(leaderboard_id, published_at, content_hash)
);
CREATE INDEX snapshots_latest_idx ON snapshots(leaderboard_id) WHERE is_latest;
CREATE INDEX snapshots_lb_date_idx ON snapshots(leaderboard_id, published_at DESC);

CREATE TABLE leaderboard_entries (
  id            bigserial PRIMARY KEY,
  snapshot_id   bigint REFERENCES snapshots(id) ON DELETE CASCADE,
  model_id      int REFERENCES models(id),     -- NULL = 未匹配
  variant_key   text NOT NULL DEFAULT '',
  raw_name      text NOT NULL,
  raw_org       text,
  rank          int,
  score         numeric, score_lower numeric, score_upper numeric,
  votes         int,
  percentile    numeric,                       -- 仅对已匹配行计算
  redistributable boolean DEFAULT true,        -- Epoch 外部来源行 = false
  extra         jsonb
);
CREATE INDEX entries_snapshot_idx ON leaderboard_entries(snapshot_id);
CREATE INDEX entries_model_idx    ON leaderboard_entries(model_id, snapshot_id);
CREATE INDEX entries_unmatched_idx ON leaderboard_entries(raw_name) WHERE model_id IS NULL;

-- 元数据（OpenRouter） --------------------------------------------
CREATE TABLE model_meta (
  model_id        int PRIMARY KEY REFERENCES models(id),
  openrouter_id   text,
  context_length  int,
  price_prompt_per_m numeric, price_completion_per_m numeric,
  seen_at         timestamptz,
  raw             jsonb
);

-- 派生表（compute 全量重算，可随时 TRUNCATE 重建） -----------------
CREATE TABLE model_summaries (
  model_id           int PRIMARY KEY REFERENCES models(id),
  coverage           int NOT NULL,
  median_percentile  numeric, best_percentile numeric, worst_percentile numeric,
  disagreement_score numeric,
  disagreement_flag  text,                     -- none|medium|high
  disagreement_pair  jsonb,                    -- {"high":"livebench-coding","low":"lmarena-text-coding", ...}
  rank_delta_7d      numeric, rank_delta_30d numeric,
  per_leaderboard    jsonb NOT NULL,           -- [{lb:"lmarena-text-overall",rank:5,score:1410,percentile:97,variant:"",published_at:"..."}]
  computed_at        timestamptz DEFAULT now()
);
CREATE INDEX summaries_disagree_idx ON model_summaries(disagreement_flag) WHERE disagreement_flag <> 'none';

CREATE TABLE model_history (                   -- 日粒度序列，供趋势图直接读
  model_id       int REFERENCES models(id),
  leaderboard_id int REFERENCES leaderboards(id),
  published_at   date NOT NULL,
  rank int, score numeric, percentile numeric, batch_key text,
  PRIMARY KEY(model_id, leaderboard_id, published_at)
);

-- 运营表 ----------------------------------------------------------
CREATE TABLE unmatched_names (
  id          serial PRIMARY KEY,
  source_slug text, raw_name text, raw_org text,
  suggestion  text,                            -- 模糊匹配建议 slug
  first_seen  timestamptz DEFAULT now(),
  status      text DEFAULT 'pending',          -- pending|resolved|ignored
  UNIQUE(source_slug, raw_name)
);

CREATE TABLE pipeline_runs (
  id        bigserial PRIMARY KEY,
  source_slug text, started_at timestamptz, finished_at timestamptz,
  status    text,                              -- ok|warn|failed
  stats     jsonb, error text
);

CREATE TABLE weekly_posts (
  id           serial PRIMARY KEY,
  slug         text UNIQUE NOT NULL,           -- '2026-w12'
  published_at date NOT NULL,
  source_locale text DEFAULT 'zh',
  mdx_path     text NOT NULL
);
CREATE TABLE weekly_post_translations (
  post_id   int REFERENCES weekly_posts(id) ON DELETE CASCADE,
  locale    text NOT NULL,
  title text, summary text, body_mdx text,
  model_used text, translated_at timestamptz,
  PRIMARY KEY(post_id, locale)
);

-- 变现预留（MVP 建表不启用） --------------------------------------
CREATE TABLE api_keys (
  id serial PRIMARY KEY, key_hash text UNIQUE NOT NULL, owner_email text,
  plan text DEFAULT 'free', created_at timestamptz DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE api_usage_daily (
  key_id int REFERENCES api_keys(id), day date, requests int DEFAULT 0, PRIMARY KEY(key_id, day)
);
```

**容量估算**：LMArena 全历史 ≈ 几十万 entries 行（每行 ~150 B）→ < 100 MB；一年总量 < 200 MB，Neon 免费层够用（**【需核实】** 配额）。

---

## 4. 页面 / URL 结构（SEO 优先）

### 4.1 路由表

| 页面 | URL（以 zh 为例） | 渲染 | 主要内容 / 目标关键词 |
|---|---|---|---|
| 首页 | `/zh` | SSG | 国产 Top 10 跨榜单卡片、全球 Top 10、本周分歧最大的 5 个模型、最新周报 |
| 模型页 | `/zh/models/deepseek-v3-0324` | SSG（top 300）/ 按需 | 跨榜单排名表、分歧标记、趋势图、价格、variants、厂商自报分数（单独区块）、相似模型对比入口 |
| 榜单页 | `/zh/leaderboards/lmarena-text-overall` | SSG | 最新 snapshot 全表 + 数据来源署名 + 更新日期 + 国产模型高亮 |
| 榜单历史 | `/zh/leaderboards/lmarena-text-overall/2026-03-15` | 按需 | 历史 snapshot（`noindex`，防薄内容；只给内链和 Pro） |
| 类别 hub | `/zh/leaderboards/coding` | SSG | 跨源 coding 榜单汇总（percentile 中位数排序） |
| 对比页 | `/zh/compare/deepseek-v3-0324-vs-qwen3-235b-a22b` | 预生成热门对 / 按需 | 两模型逐榜单对比、共同出现的榜单、价格对比、趋势叠加 |
| 厂商页 | `/zh/vendors/deepseek` | SSG | 该厂商所有模型时间线、各模型最佳排名 |
| 国产专题 | `/zh/chinese-models` | SSG | 核心差异化页：所有 `country='CN'` 模型跨榜单总表 |
| 开源专题 | `/zh/open-weights-models` | SSG | `open_weights=true` 总表 |
| 周报列表 | `/zh/weekly` | SSG | — |
| 周报 | `/zh/weekly/2026-w12` | SSG | 中文原创 + 其他语言翻译 |
| 方法论 | `/zh/methodology` | SSG | 分数/百分位/分歧算法说明（被引用、建信任、E-E-A-T） |
| 数据源与署名 | `/zh/sources` | SSG | 许可证全文链接 |
| 搜索 | `/zh/search?q=` | 客户端 | `noindex` |

**slug 规则**：model/vendor/leaderboard slug 全语言共用、不翻译；只有 UI 文案和描述翻译。对比页 slug 按字母序排列，`/compare/b-vs-a` 301 到 `/compare/a-vs-b`。

**热门对预生成**：国产 Top 20 两两组合（190 对）+ 每个国产 Top 20 × 全球 Top 10（200 对）≈ 400 页 × 7 语言 = 2,800 页，构建可承受（< 5 分钟）。其余对按需生成 + `revalidate=86400`。**对比页只在两模型至少共同出现在 2 个榜单时 index**，否则 `noindex`（防薄内容）。

### 4.2 Metadata 规则（`generateMetadata`）

```ts
// apps/web/lib/seo.ts
export function alternates(path: string) {
  const base = 'https://你的域名';
  return {
    canonical: `${base}/${locale}${path}`,
    languages: Object.fromEntries([
      ...LOCALES.map(l => [l, `${base}/${l}${path}`]),
      ['x-default', `${base}/en${path}`],
    ]),
  };
}
```

- **hreflang**：7 个 locale + `x-default`（指向 en），每页自引用，双向一致（next-intl 的 `localePrefix: 'always'`，根 `/` 308 → 按 `Accept-Language` 跳，但 **bot 一律落 `/en`**，避免 Googlebot 被重定向打乱）。
- **canonical**：每个 locale 自引用；带 query 的 URL 的 canonical 指向无 query 版本。
- **title 模板**：模型页 `"{name} 排名：LMArena、LiveBench 等 {n} 个榜单对比（{YYYY-MM}）"`，英文 `"{name} Benchmark Rankings Across {n} Leaderboards ({Month YYYY})"`。日期动态，促进"新鲜度"重抓。
- **description**：由数据生成一句话："DeepSeek V3 0324 在 LMArena 总榜排第 7（1402），LiveBench 第 12，分歧度低。" 每种语言用 ICU 模板，不调 LLM。

### 4.3 结构化数据（JSON-LD，服务端注入）

| 页面 | 类型 |
|---|---|
| 全站 | `WebSite`（含 `SearchAction`）+ `Organization` |
| 模型页 | `Dataset`（`name`、`description`、`isBasedOn` 各源 URL、`license`）+ `BreadcrumbList` + `FAQPage`（3 个固定问答：排名多少 / 是否开源 / 价格，从数据渲染） |
| 榜单页 | `Dataset` + `ItemList`（前 20 名，`item.name`=模型名，`url`=模型页）+ `BreadcrumbList` |
| 周报 | `Article`（`author`、`datePublished`、`inLanguage`，翻译页 `translationOfWork` 指向中文原文） |
| 对比页 | `BreadcrumbList`（不强行套 Product 比较类型，避免被判滥用） |

**【需核实】** `FAQPage` 富结果 Google 已限制只对权威政府/医疗站展示，但结构化本身无害；若不想维护可删。

### 4.4 Sitemap

- `app/sitemap.ts` 返回 **sitemap index**，拆分为 `sitemap/models.xml`、`sitemap/leaderboards.xml`、`sitemap/compare.xml`、`sitemap/vendors.xml`、`sitemap/weekly.xml`、`sitemap/static.xml`；每条 URL 带 `alternates.languages`（Next 15 支持），每文件 < 50,000 条。
- 只收录 index 页面（排除 `noindex` 的历史快照、冷门对比页）。
- `lastModified` = 该页依赖的最新 `snapshots.published_at`。
- pipeline 完成后：`POST /api/revalidate` → 再调用 **IndexNow**（Bing/Yandex 即时）；Google 靠 sitemap。
- `robots.txt`：`Disallow: /*/search`, `/api/`，`Sitemap:` 指向 index。

### 4.5 防薄内容 / 重复内容

- 模型页至少要有：≥ 1 个榜单数据 + 自动摘要段 + 趋势图，否则 `noindex`（`coverage=0` 的模型不上 sitemap）。
- 自动摘要段用**模板 + 数据**生成 3–5 句话（每语言 ICU 模板），而非每页 LLM 生成（成本与质量都不可控）。
- 各语言页面内容差异仅为 UI/模板文案 → 属于正常的 hreflang 多语言站，不是重复内容；但**数字表格相同**，所以周报（原创内容）和方法论页是站点 E-E-A-T 的核心，务必坚持。

---

## 5. i18n 方案

| 项 | 方案 |
|---|---|
| 路由 | next-intl，`app/[locale]/…`，`localePrefix: 'always'`，`locales = ['en','zh','es','de','fr','ja','pt']`，`defaultLocale='en'` |
| UI 文案 | `messages/{locale}.json`，ICU 格式。**只维护 en + zh 两份源文件**，其余 5 种语言由脚本 `pnpm i18n:translate` 用 DeepSeek-V3 批量翻译并写入 json，diff 后人工抽查，进 Git |
| 数据描述 | 模型页摘要、分歧文案、meta description 全部是 **ICU 模板 + 数据插值**，零 LLM 调用 |
| 榜单/类别/厂商名 | 专有名词不翻译；类别名（`coding`→「编程」）在 messages 中维护 |
| 周报 | 中文写 `content/weekly/2026-w12.zh.mdx`（front-matter：title、summary、date、models: [slug…]）→ `pnpm weekly:translate` 调 LLM 翻译为 6 种语言，写入 `weekly_post_translations`；英文版你可人工润色后覆盖 |
| 翻译成本 | 周报 ~2,000 字 × 6 语言 ≈ 30k tokens 输出/周，DeepSeek 价格下 < ¥1/周；UI json 一次性 < ¥2 |
| 翻译质量兜底 | 翻译 prompt 要求保留 MDX 组件、链接、数字、模型名不变；脚本用正则校验组件标签数量一致，不一致则告警不入库 |
| 日期/数字 | `Intl.NumberFormat / DateTimeFormat`，服务端渲染 |
| 语言切换 | `<link rel="alternate">` 已有，页头下拉切换到同路径其他 locale |
| 搜索引擎差异 | zh 面向百度/必应：生成 `sitemap` 同样提交百度站长（**【需核实】** 百度对非 ICP 备案的海外站收录较弱，可接受）|

---

## 6. 更新任务

### 6.1 任务清单

| 任务 | 运行位置 | cron（UTC） | 做什么 |
|---|---|---|---|
| `ingest-openrouter` | GitHub Actions | `0 2 * * *` | 拉 models → upsert `model_meta` |
| `ingest-lmarena` | GitHub Actions | `15 3 * * *` | 下载 parquet → 新 snapshot（仅有变化时） |
| `ingest-livebench` | GitHub Actions | `30 3 * * *` | 检查 commit sha → 有变则入库 |
| `ingest-epoch` | GitHub Actions | `45 3 * * 1`（周一） | 下载 CSV → 入库 |
| `ingest-vendor-reported` | GitHub Actions | `on: push paths: data/vendor-reported/**` | 解析 yaml → 入库 |
| `sync-aliases` | GitHub Actions | `on: push paths: pipeline/normalize/identity/aliases.yaml` | 同步 `model_aliases` → 重匹配 `model_id IS NULL` 行 → compute |
| `compute` | 同一 workflow 的最后一个 job（`needs: [ingest-*]`，`if: always()`） | 每日 ingest 后 | 重算 percentile / `model_summaries` / `model_history` → 标记 `is_latest` |
| `validate + revalidate` | compute 之后 | — | 跑校验 → `POST /api/revalidate`（`revalidateTag('leaderboards')` 等）→ IndexNow |
| `weekly-translate` | GitHub Actions | `on: push paths: content/weekly/**` | 翻译新周报 → 入库 → revalidate `weekly` |
| `healthcheck` | **Vercel Cron**（唯一一个） | `0 6 * * *` → `/api/cron/daily` | 检查每个 enabled source 的最新 `snapshots.captured_at` 是否超过阈值（LMArena 10 天、LiveBench 45 天、Epoch 14 天、OpenRouter 2 天）；超则 Telegram 告警；兜底 revalidate |
| `db-backup` | GitHub Actions | `0 5 * * 0` | `pg_dump` 压缩上传到 GitHub Release 私有资产或 Cloudflare R2 免费层（Neon 免费层 PITR 只有极短窗口，**【需核实】**） |

Workflow 文件：`.github/workflows/pipeline.yml`，`concurrency: pipeline`（防并发写库），`workflow_dispatch` 带 `source` 输入可单独重跑。

### 6.2 失败重试

- **HTTP 层**（`base.ts`）：指数退避 3 次（1s/4s/16s），429/5xx/网络错误重试，4xx 不重试。
- **Job 层**：用 `nick-fields/retry@v3` 包一层，`max_attempts: 2`，`retry_wait_seconds: 300`。
- **幂等保证**：snapshot 按 `content_hash` 唯一；重跑不产生重复数据。写入用单事务：`INSERT snapshot → INSERT entries → UPDATE is_latest`，任一失败全回滚。
- **隔天自愈**：所有数据源都是慢更新，当天失败由第二天的定时运行自然补上；`healthcheck` 负责在「连续多天失败」时报警。

### 6.3 数据校验（`validate/checks.ts`，分 `critical` / `warn`）

| 检查 | 级别 | 规则 |
|---|---|---|
| 行数突变 | critical | `row_count` 与上一 `ok` snapshot 相比变化 > 40% → snapshot 标 `rejected`，不设 `is_latest` |
| Top-10 重叠 | critical | 与上一 snapshot 的 Top-10 模型重叠 < 50% → rejected（防解析错位） |
| 分数范围 | critical | `percent` 不在 0–100、`elo` 不在 600–2000 → rejected |
| 日期倒退 | critical | `published_at` 早于当前 latest → 不替换 latest（允许入库作历史） |
| 匹配率 | warn | `matched_count/row_count < 0.85` → 告警，仍入库 |
| 新未匹配名 | warn | `unmatched_names` 新增 > 0 → 推送清单 |
| 新类别 | warn | 出现未在 `CATEGORY_MAP` 的类别 |
| 新鲜度 | warn | 见 healthcheck 阈值 |
| 分歧跳变 | warn | 任一模型 `disagreement_score` 单日变化 > 30 → 列入告警（可能是匹配错误） |
| 翻译完整性 | critical | MDX 组件数、链接数与原文不一致 → 不入库 |

### 6.4 告警

- 统一入口 `alerts/telegram.ts`：`notify(level, title, lines[])`，用 Bot Token + chat_id（GitHub Secrets）。
- 每次 pipeline 结束**必发一条摘要**（成功也发），格式：`✅ lmarena: 7 new snapshots, 1,842 rows, 96% matched, 4 unmatched` —— 没收到摘要本身就是故障信号。
- Sentry 接 Next.js 运行时错误；pipeline 的异常也 `Sentry.captureException` 后再抛。
- `pipeline_runs` 表留 90 天，`/zh/sources` 页面公开展示各源「最后更新时间」（透明度 + 用户信任）。

---

## 7. 变现钩子

### 7.1 功能分层

| 功能 | 免费 | Pro（预计 $6–9/月） | API |
|---|---|---|---|
| 全部页面、榜单、对比（2 模型） | ✅ | ✅ | — |
| 历史趋势 | 最近 90 天 | 全历史 | 全历史 |
| 对比页 | 2 模型 | 最多 6 模型（`/compare?models=a,b,c` 动态页，noindex） | — |
| CSV / JSON 导出 | ❌ | ✅ | ✅ |
| 排名变动提醒（邮件/Telegram：关注的模型进出 Top N、分歧变 high） | ❌ | ✅ | — |
| 自定义权重综合榜（自选榜单+权重，前端计算） | ❌ | ✅ | — |
| 历史快照页 | ❌ | ✅ | ✅ |
| 去广告 | — | ✅ | — |
| `/api/v1/*` | 需 key，100 req/天 | 1,000 req/天 | Developer $19/月 10k/天；Business 另谈 |

**API 端点（只读，MVP 周 4 上线免费层即可）**：

```
GET /api/v1/models?vendor=deepseek&country=CN&category=overall&limit=50
GET /api/v1/models/{slug}                 → summary + per_leaderboard
GET /api/v1/models/{slug}/history?leaderboard=lmarena-text-overall&from=2025-01-01
GET /api/v1/leaderboards
GET /api/v1/leaderboards/{slug}?date=latest|YYYY-MM-DD
GET /api/v1/compare?models=a,b
响应统一包裹：{ data, meta: { generated_at, sources: [{slug, license, attribution_url}] } }
```

### 7.2 预留接口（MVP 就写好，但只走 free 分支）

- `lib/entitlements.ts`：`getPlan(session|apiKey) → 'anon'|'free'|'pro'|'dev'`；`can(plan, 'export_csv')` 一处判断，UI 与 API 共用，Pro 功能全部用 `<Paywall feature="…">` 包裹而不是不渲染（让搜索引擎与用户看到功能存在）。
- 限流：中间件 `lib/ratelimit.ts` 接口固定，MVP 实现为内存 Map（Edge 不保证一致，先接受）；收费后换 Upstash Redis 滑动窗口（免费层 10k 命令/天）。
- 鉴权：`Authorization: Bearer {key}`，DB 只存 `sha256(key)`；用量计入 `api_usage_daily`。
- 支付：预留 `app/api/webhooks/payments/route.ts`。独立开发者建议用 **Lemon Squeezy 或 Paddle（Merchant of Record，代扣各国增值税）**；**【需核实】** 你所在地区能否开通及出款方式。
- 许可边界：API/导出**只返回 `redistributable=true` 的行**，响应 `meta.sources` 自带 CC-BY 署名；Epoch 外部来源行与厂商自报行默认不出 API。
- 升级 Vercel Pro 的触发条件：第一笔收入或接入广告前。

---

## 8. 4 周开发计划

| 周 | 目标 | 本周任务 | 周末可上线的里程碑 |
|---|---|---|---|
| **W1：骨架 + 主数据源** | 有数据的站点上线 | ① monorepo（pnpm workspaces：`apps/web`、`packages/db`、`pipeline`）、Drizzle schema + 迁移、Neon 连通；② `lmarena` adapter + parquet 解析 + 历史回填；③ `matcher` + 冷启动 `aliases.yaml`（你人工过一遍未匹配名）；④ `compute` 基础版（percentile、summaries）；⑤ 页面：首页、模型页、榜单页（仅 en/zh，布局粗糙无妨）；⑥ Vercel 部署、`/api/revalidate`、GitHub Actions 日更 workflow + Telegram 摘要 | 公网可访问，LMArena 全类别 + 全历史入库，每个模型有页面，Top 国产模型可查跨类别排名。**提交 Search Console** |
| **W2：多源 + 差异化功能** | 三大差异化成型 | ① `livebench`、`epoch`、`openrouter` adapters（含许可确认，未确认则先 `enabled=false`）；② 分歧计算 + UI 标记 + 文案；③ 服务端 SVG 趋势图（含 batch 分段）；④ 对比页（含 slug 规范化与 301）、厂商页、国产专题页、开源专题页；⑤ 校验规则 + `rejected` 机制；⑥ `vendor-reported` yaml 格式 + 录入 6 家国产厂商旗舰模型 | 模型页呈现「跨榜单表 + 分歧标记 + 趋势图」；`/chinese-models` 上线；pipeline 带校验与告警 |
| **W3：SEO + i18n + 内容** | 7 语言、可被收录 | ① next-intl 7 locale、hreflang、canonical、sitemap index、robots、JSON-LD、IndexNow；② en/zh messages 完成 → 脚本翻译 5 语言；③ 模型页 ICU 摘要模板 + title/description 模板；④ 周报系统（MDX + 翻译脚本 + 列表页）并发布**第 1 期**；⑤ 方法论页、数据源署名页；⑥ `noindex` 规则（薄页面、历史快照、搜索页） | 全站 7 语言，sitemap 提交，第 1 期周报发布，Lighthouse SEO/Perf ≥ 95 |
| **W4：打磨 + API + 发布** | 公开发布 | ① `/api/v1` 免费层（key 申请页、内存限流、署名 meta）；② `entitlements` + Paywall 组件（Pro 功能占位）；③ healthcheck Vercel Cron、`db-backup`；④ 性能：top 300 模型页与 400 对比页预生成、图片/字体优化；⑤ Sentry、Umami；⑥ 发第 2 期周报；⑦ 发布：V2EX / 即刻 / Hacker News / Reddit r/LocalLLaMA / X，并给 LMArena、LiveBench 发「我们引用了你们」的邮件（换外链）| 正式发布；API 可申请；监控、备份、告警齐备；两期周报 |

W1 的人工别名审核与 W2 的许可邮件是关键路径上的**人工环节**，开工第一天就发邮件。

---

## 9. 风险与缓解

| 类别 | 风险 | 可能性/影响 | 缓解 |
|---|---|---|---|
| **法律/许可** | LiveBench / OpenCompass / SuperCLUE 结果数据许可不明；Epoch 外部来源行被误再分发 | 中/高 | 未获确认一律 `enabled=false`；`redistributable` 字段 + API 过滤；`/sources` 页面公开许可与署名；收到下架请求 24h 内可一键禁用源（`sources.enabled=false` + revalidate） |
| | 使用"Arena""LiveBench"等名称与 logo 的商标问题 | 低/中 | 只用文字名称作事实引用，不用 logo；页脚声明无关联 |
| | 厂商自报分数被当成第三方评测误导 | 中/中 | UI 独立区块、灰底、标签「厂商自报 · 未经独立验证」，不计入分歧与 percentile |
| **数据源变更** | HF 数据集 schema / config 名变化、LiveBench 文件路径变化 | 高/中 | zod 严格校验 + `rejected` 机制保证坏数据不上线；adapter 单元测试用固化 fixture；healthcheck 新鲜度告警 |
| | LMArena 调整评分方法（如默认 style control）导致历史不连续 | 中/中 | `batch_key` 分段 + 趋势图标注；不同 config 做不同 leaderboard |
| | 数据源关闭公开数据 | 低/高 | 多源设计，任一源下线站点仍可运行；快照已在本地 DB 永久保存（历史数据是你的护城河） |
| **身份映射错误** | 别名错配导致排名张冠李戴（最伤信誉） | 中/高 | 模糊匹配永不自动采用；`disagreement` 跳变告警；模型页显示每条数据的 `raw_name`（可核对）；用户「报告错误」按钮 → GitHub Issue 模板 |
| **SEO** | 数万页数据表格被判薄内容/程序化页面；多语言被判重复 | 中/高 | `coverage=0` / 无共同榜单页面 `noindex`；ICU 模板摘要；周报与方法论原创；hreflang 双向严格一致；先让 en/zh 收录稳定再观察小语种（必要时小语种 `noindex` 保留 hreflang） |
| | 新站无权重、竞品先发 | 高/中 | 差异化关键词：「{国产模型名} 排名 / 评测 / vs」长尾；周报可被引用；向数据源方换外链；中文社区分发 |
| **维护成本** | 别名表、厂商自报、周报都要人工 | 高/中 | 每周固定 1 小时：10 分钟别名审核 + 50 分钟周报；厂商自报只录旗舰；Telegram 摘要让"无事可做"成为默认 |
| **成本** | 对比页按需生成导致函数调用超 Hobby 额度；Neon 空闲唤醒延迟 | 低/低 | 冷门对比页 `revalidate=86400` + CDN 缓存；Neon 冷启 ~0.5s 对 ISR 可接受；超额前先开 Vercel Pro |
| **竞争** | LLM Stats / Vellum 增加国产模型覆盖和多语言 | 中/中 | 坚持国产模型深度（厂商自报、中文类别、发布时间线）+ 分歧标记 + 中文周报，三者叠加短期难抄 |
| **可信度** | "分歧度"被误读为"某榜单不准" | 中/低 | 方法论页解释：分歧来自评测维度不同，不代表对错；UI 文案用「榜单看法不一」而非「异常」 |

### 许可确认邮件模板（给 LiveBench / OpenCompass / SuperCLUE）

```
Subject: Permission request — republishing {Leaderboard} results on an aggregator site

Hi {Team},

I'm an independent developer building {站点名} ({域名}), a non-commercial (for now)
site that aggregates public LLM leaderboards and shows per-model rankings across them,
with a focus on Chinese-developed models.

I'd like to display the latest {Leaderboard} results (model name, score, rank, date) with
clear attribution and a link back to {原站 URL} on every page, and to keep historical
snapshots for trend charts. I would not host your evaluation data/questions.

Could you confirm whether this use is permitted, and under what license / attribution
wording you prefer? If you'd rather I only link to your site, I'll do that instead.

Thanks for the work you do — happy to share traffic data or credit you however you'd like.

{你的名字}
```

---

### 交给 Claude Code 前的最后检查清单

1. 确认 `lmarena-ai/leaderboard-dataset` 的 License 字段与 config 列表、`category` 是否含 `chinese`。
2. 确认 LiveBench 结果文件路径与许可；OpenRouter 是否有 rankings 官方端点（没有就只用 `/models`）。
3. 确认 Epoch CSV 直链与 `Source` 列名。
4. Neon 免费层存储配额、Vercel Hobby cron 条数。
5. 支付方案（Lemon Squeezy / Paddle）在你所在地的可用性——W4 之前不影响开发。

按本文件顺序让 Claude Code 先建 `packages/db`（第 3 节）→ `pipeline/adapters/lmarena.ts` + `matcher`（第 2 节）→ `apps/web` 路由（第 4 节），每一步用 fixture 跑通再接真实数据。