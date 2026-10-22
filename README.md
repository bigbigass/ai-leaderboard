# AI Leaderboard

An AI model leaderboard aggregator. It ingests public evaluation boards (LMArena and Epoch AI, plus OpenRouter metadata and pricing) and maps them onto one canonical model identity. It then publishes cross-board rankings, disagreement flags, trend charts and prices as a statically generated, SEO-first Next.js site in 7 languages (en, zh, es, de, fr, ja, pt), with a special focus on Chinese models vs. global models.

Spec: [SPEC.md](SPEC.md) · Full architecture (Chinese): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). All code in this repo is written by Claude Code.

## Layout

```
apps/web/           Next.js 15 (App Router, TS strict, Tailwind v4 + shadcn/ui, next-intl)
  messages/<locale>.json   UI copy (en + zh hand-written, 5 more full translations)
  scripts/ → ../../scripts/smoke.mjs   end-to-end checks against a running site
packages/db/        Drizzle schema, migrations, client, read queries
  seed/             committed offline fixture (LMArena/Epoch/OpenRouter raw payloads)
pipeline/           adapters, matcher, validation, compute, CLI
  adapters/         lmarena · epoch · openrouter (enabled); livebench · opencompass · superclue (disabled)
  data/aliases.yaml canonical models + per-source aliases (the ONLY way a name gets matched)
  data/vendors.yaml vendors + country
  sources.config.ts enabled flag per source
.github/workflows/  ci.yml (lint, typecheck, test, build, seed + smoke) · ingest.yml (daily pipeline)
```

## Dev commands

Requires Node ≥ 20.11, pnpm 10 and Postgres (local Postgres 16 or a Neon branch).

```bash
pnpm install
cp .env.example .env            # then export the variables (or use direnv)
pnpm db:migrate                 # apply Drizzle migrations
pnpm db:seed                    # load the offline fixture: 30 models (14 Chinese), LMArena history, Epoch, OpenRouter prices
pnpm dev                        # http://localhost:3000 → redirects to /en (or your Accept-Language)

pnpm lint                       # ESLint (flat config, whole repo)
pnpm typecheck                  # tsc --noEmit in every package
pnpm test                       # Vitest (pipeline + web). Set TEST_DATABASE_URL to a throwaway DB to also run the Postgres integration test
pnpm build                      # next build (works with no DB, an empty DB or a seeded DB)
pnpm start & pnpm smoke         # end-to-end checks: every page type × 7 locales, hreflang, canonical, noindex, JSON-LD, sitemap, redirects, /api/revalidate
```

### Pipeline CLI

```bash
pnpm pipeline sources                    # list sources + enabled flag
pnpm pipeline run                        # fetch → parse → match → validate → write → compute, all enabled sources (latest data)
pnpm pipeline run --source epoch         # one source
pnpm pipeline backfill lmarena           # ingest the complete LMArena history (every leaderboard_publish_date)
pnpm pipeline run --fixtures packages/db/seed   # same flow from local files instead of the network
pnpm pipeline compute                    # recompute model_history + model_summaries
pnpm pipeline review                     # print the match review queue (also written to pipeline/out/review.json)
pnpm pipeline rematch                    # after editing aliases.yaml: re-apply aliases to stored unmatched rows, then recompute
```

**Approving a review item** is a human step: add the alias to `pipeline/data/aliases.yaml`, commit, then run `pnpm pipeline rematch`. Fuzzy suggestions are never applied automatically, and unmatched rows are stored but never published.

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | web, pipeline, migrations | Neon **pooled** URL in production (prepared statements are disabled for PgBouncer). |
| `REVALIDATE_SECRET` | web (`/api/revalidate`), ingest workflow | Shared secret, sent as the `x-revalidate-secret` header (or `Authorization: Bearer`). |
| `NEXT_PUBLIC_SITE_URL` | web | Absolute origin for canonical, hreflang, sitemap and JSON-LD (e.g. `https://example.com`). |
| `SITE_URL` | ingest workflow | Origin the workflow POSTs `/api/revalidate` to. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | pipeline, ingest workflow | Optional run summary / failure alert; skipped if unset. |
| `DISAGREEMENT_THRESHOLD` | pipeline compute, web copy | Optional; default 25 percentile points. |
| `TEST_DATABASE_URL` | tests | Optional; enables the Postgres integration test (it truncates every table). |

GitHub secrets for the workflows: `DATABASE_URL`, `REVALIDATE_SECRET`, `SITE_URL` (+ optional Telegram pair).

## Pages

All pages live under `/[locale]` (`en zh es de fr ja pt`, always prefixed). `/` redirects using Accept-Language; crawlers always go to `/en`.

| Route | Notes |
|---|---|
| `/` | China Top 10, Global Top 10, biggest disagreements, recent movers |
| `/models`, `/models/[slug]` | cross-board ranks, disagreement explanation, server-rendered SVG trend chart (batch-segmented), OpenRouter price, variants, attribution |
| `/leaderboards`, `/leaderboards/[source]`, `/leaderboards/[source]/[board]` | full ranking table with publish date and history links |
| `/leaderboards/[source]/[board]/[date]` | archived snapshot (always `noindex`) |
| `/categories`, `/categories/[category]` | merged cross-board view (median percentile) |
| `/compare`, `/compare/[a]-vs-[b]` | alphabetical canonical slug; reversed order → 301 |
| `/vendors`, `/vendors/[slug]` | |
| `/chinese-models` | China hub + best Chinese model vs. global leader per category |
| `/sources` | every enabled source, license, link, last update |
| `/methodology` | matching, variants, percentiles, disagreement, validation |
| `/sitemap.xml`, `/sitemaps/[group]-[n].xml`, `/robots.txt`, `POST /api/revalidate` | |

**Rendering:** SSG + ISR (`revalidate = 86400`). Top 300 models, all boards, hubs and popular compare pairs are pre-generated. Everything else renders on demand (`dynamicParams = true`). Every DB read goes through Next's data cache with the tag `db`, so the ingest job refreshes the site with `POST /api/revalidate {"tags":["db"],"paths":["/"]}`.

**SEO:** every page sets a self-canonical plus hreflang for all 7 locales and `x-default` (→ `en`). JSON-LD covers `WebSite`, `BreadcrumbList`, `Dataset` (boards, with license and attribution), `ItemList` (rankings) and `SoftwareApplication` (models). Thin pages get `noindex, follow` and are left out of the sitemap:

- models with data from fewer than 2 sources and no price;
- compare pages sharing fewer than 2 boards;
- empty category or vendor hubs;
- history snapshots.

The sitemap becomes an index once it exceeds 5,000 URLs.

## Data sources

| Source | Status | Use |
|---|---|---|
| LMArena (`lmarena-ai/leaderboard-dataset`, HF parquet) | enabled | rankings, all configs/categories, full history |
| Epoch AI (benchmarking hub CSVs) | enabled | rankings; attribution on every page that shows it; external rows flagged `redistributable=false` and labelled with their original source |
| OpenRouter (`/api/v1/models`) | enabled | pricing + context length only, never a score |
| LiveBench / OpenCompass / SuperCLUE | `enabled=false` | not fetched, not shown anywhere until licenses are confirmed |
| Artificial Analysis | never | no adapter, by design |

**Validation:** these problems reject a snapshot (stored as `rejected`, never published, last good data stays live):

- a row-count drop of more than 30%;
- a schema mismatch (this fails the whole source batch);
- all scores null;
- scores out of range.

Warnings are logged in `pipeline_runs`: low match rate, unmapped category and Top-10 churn.

> **Seed data is illustrative.** `packages/db/seed/` is generated by `pipeline/scripts/generate-fixtures.ts` with plausible but made-up numbers, so the site builds offline. Run `pnpm pipeline backfill lmarena && pnpm pipeline run` against a real database to replace it with live data.

## Deploying (Vercel + Neon) — not done automatically

1. **Database:** create a Neon project (or use the Vercel ↔ Neon integration) and copy the **pooled** connection string.
2. **Migrate + load data** from your machine or the Ingest workflow:
   - `DATABASE_URL=… pnpm db:migrate`
   - then either `pnpm db:seed` (fixture) or `pnpm pipeline backfill lmarena && pnpm pipeline run` (live data).
3. **Vercel project:**
   - import the repo and set **Root Directory** = `apps/web` (framework: Next.js);
   - install command `pnpm install`, build command `pnpm build`;
   - env vars: `DATABASE_URL`, `REVALIDATE_SECRET`, `NEXT_PUBLIC_SITE_URL`.
4. **GitHub secrets:** add `DATABASE_URL`, `REVALIDATE_SECRET` and `SITE_URL` (the deployed origin), plus optionally `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`. The **Ingest** workflow runs daily at 03:15 UTC. It can also be run by hand from the Actions tab, optionally for a single source or as an LMArena backfill. Each run migrates, runs the pipeline (retrying up to 3 times), then calls `/api/revalidate`.
5. Run `pnpm db:migrate` before the first deploy. The Ingest workflow also migrates on every run.

## Not yet implemented (W3/W4 per SPEC)

Weekly report MDX system, IndexNow, `/api/v1`, entitlements/paywall, Sentry/Umami, backups, vendor-reported scores, open-weights hub, on-site search.
