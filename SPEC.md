# SPEC.md — AI Leaderboard Aggregator (Week 1 + Week 2)

Instructions for a Claude Code cloud session. Read this file fully, then `docs/ARCHITECTURE.md` (Chinese; the detailed design: schema §3, routes §4, i18n §5, jobs §6, plan §8). When they conflict, **this file wins**. Implement end to end in the repo root; commit with clear messages and `git push origin main` (no PR). Do NOT buy domains or paid services.

## 1. Stack
- **Next.js 15** App Router + **TypeScript (strict)** + **Tailwind v4 + shadcn/ui**. Vitest for tests.
- **Neon Postgres + Drizzle ORM** (schema + migrations via drizzle-kit). `DATABASE_URL` env var.
- **next-intl**, 7 locales: `en, zh, es, de, fr, ja, pt`, always-prefixed routes (`/en/...`, `/zh/...`); `/` redirects by Accept-Language → `/en` fallback.
- Layout: pnpm workspaces — `apps/web`, `packages/db` (schema, client, queries), `pipeline` (adapters, matcher, compute, validate, CLI).
- Analytics: `@vercel/analytics`.

## 2. Rendering & SEO
- **SSG + ISR**: all pages statically generated with `revalidate` (e.g. 86400). Pre-generate top models/boards; others on demand (`dynamicParams = true`).
- **`POST /api/revalidate`**: guarded by `REVALIDATE_SECRET` header; accepts `{ tags?: string[], paths?: string[] }`; uses `revalidateTag`/`revalidatePath`. Called by the ingest job after a successful run.
- `generateMetadata` per page: title/description templates per locale, canonical, **hreflang alternates for all 7 locales + x-default**.
- `sitemap.ts` (sitemap index if > 5k URLs, all locales, only indexable pages), `robots.ts`.
- **JSON-LD** server-injected: `WebSite`, `BreadcrumbList`, `Dataset` (leaderboard pages, with source attribution/license), `ItemList` (rankings), `SoftwareApplication`/`Product`-like for model pages.
- **Thin pages → `noindex, follow`**: model with data from < 2 sources and no price, compare pages where either model has < 2 shared boards, empty category/vendor pages, search/history snapshots. Excluded from sitemap.
- Compare slugs normalized (alphabetical `a-vs-b`); non-canonical order → 301.

## 3. Data sources (one adapter per source)
Each adapter in `pipeline/adapters/<source>.ts` implements a common interface: `fetch() → raw`, `parse(raw) → NormalizedScore[]`, plus metadata `{ id, name, url, license, attribution, enabled }`. Config in `pipeline/sources.config.ts` with an `enabled` flag per source.

| Source | Status | Notes |
|---|---|---|
| **LMArena** | enabled | Official Hugging Face dataset (parquet). All categories, **full history backfill** (`pipeline backfill lmarena`). |
| **Epoch AI** | enabled | Public data; **attribution required** on every page that shows it + sources page (license text as published). |
| **OpenRouter** | enabled | **Metadata + pricing only** (context length, provider, $/M tokens). Never used as a ranking/score. |
| LiveBench | `enabled=false` | Adapter may be written; disabled until license confirmed. |
| OpenCompass | `enabled=false` | Same. |
| SuperCLUE | `enabled=false` | Same. |
| **Artificial Analysis** | **never** | Do not scrape, fetch or write an adapter. Not even disabled code. |

Disabled sources must not appear in UI, sitemap or JSON-LD.

## 4. Model identity mapping (`pipeline/matcher`)
- Canonical `models` table + `model_aliases` table, seeded from `pipeline/data/aliases.yaml`.
- Matching = **exact or normalized-exact (case/whitespace/punctuation) against the alias table only**.
- Fuzzy candidates (e.g. string similarity) are written to a `match_review_queue` table / `pipeline/out/review.json` with suggested target and score. **Never auto-applied.** Unmatched scores are stored but not published.
- Variant rules per ARCHITECTURE §2.4 (same weights = same model; thinking/style-control = variant).
- CLI: `pipeline review` prints the queue; approving = editing `aliases.yaml` (human step).

## 5. Compute & validation
- Per board: rank, percentile. Per model: cross-board summary.
- **Disagreement**: flag when a model's percentile differs across boards by ≥ a configurable threshold (default 25 pts); store magnitude for "biggest disagreements".
- Validation (`pipeline/validate`): `critical` checks (row-count drop > 30%, schema mismatch, all scores null) reject the batch and keep last good data; `warn` checks are logged. Rejected batches are marked, not published.

## 6. Ingest jobs (GitHub Actions)
- `.github/workflows/ingest.yml`: daily cron + `workflow_dispatch`; runs `pnpm pipeline run` (fetch → parse → match → validate → compute → write) for enabled sources, then calls `/api/revalidate`. Retries with backoff; failure → job fails (optional Telegram summary if `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` secrets exist, else skip).
- `.github/workflows/ci.yml`: install, lint, typecheck, test, build on push/PR.
- Secrets: `DATABASE_URL`, `REVALIDATE_SECRET`, `SITE_URL`.

## 7. Pages (all under `/[locale]`)
- **Home**: China Top 10, Global Top 10, biggest disagreements, weekly movers/changes.
- **Model** `/models/[slug]`: cross-board ranks table, disagreement flags + explanation, trend chart (server-rendered SVG, batch-segmented), OpenRouter price, vendor, source attribution.
- **Leaderboard** `/leaderboards/[source]` (+ `/[category]`): full ranking table with history date.
- **Category** `/categories/[category]` (coding, math, vision, …): merged view across boards.
- **Compare** `/compare/[a]-vs-[b]`: side-by-side ranks, prices, disagreements.
- **Vendor** `/vendors/[slug]`.
- **China models hub** `/chinese-models`.
- **Sources / attribution** `/sources`: every enabled source, license, link, last update.
- **Methodology** `/methodology`: matching, percentile, disagreement, validation rules.
- UI copy in `messages/<locale>.json`; en + zh hand-quality, other 5 locales full translations (no missing keys; a test enforces key parity).

## 8. Seed data
- `pnpm db:seed` loads a small committed fixture (`packages/db/seed/`: ~30 models incl. ≥ 10 Chinese, LMArena + Epoch snapshot, OpenRouter prices, aliases) so the site builds and renders with no network access.
- Build must not fail if DB is empty or unreachable at build time for on-demand pages (fallback/notFound), but seeded DB is the acceptance baseline.

## 9. Vercel deploy notes
- Project root `apps/web`, framework Next.js, install `pnpm install`, build `pnpm build`.
- Env: `DATABASE_URL` (Neon pooled URL), `REVALIDATE_SECRET`, `NEXT_PUBLIC_SITE_URL`.
- Neon via Vercel integration or manual URL; run `pnpm db:migrate` before first deploy (also in ingest workflow).
- Do not deploy yourself; document steps in README.

## 10. Acceptance criteria
1. `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass with zero errors.
2. `pnpm db:migrate && pnpm db:seed` succeed on a fresh Postgres; seed data visible on pages.
3. Every page type renders (HTTP 200) in **all 7 locales**; hreflang/canonical present; sitemap lists only indexable URLs; thin pages carry `noindex`.
4. JSON-LD validates (valid JSON, correct `@type`) — covered by tests.
5. Adapters: LMArena, Epoch, OpenRouter enabled with parser unit tests on fixtures; LiveBench/OpenCompass/SuperCLUE gated off; no Artificial Analysis code.
6. Matcher: tests prove fuzzy matches go to the review queue and are never applied.
7. `/api/revalidate` rejects bad secret (401) and revalidates with a good one.
8. GitHub Actions workflows lint-valid; README updated with dev commands, env vars, page list, deploy steps.
9. Final message: routes count, test count, deferred items.

Out of scope now (W3/W4): weekly report MDX system, IndexNow, `/api/v1`, entitlements/paywall, Sentry/Umami, backups.
