import { leaderboardEntries, leaderboards, pipelineRuns, snapshots, sources, type Db } from '@ail/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { notify } from './alerts/telegram';
import { runCompute } from './compute/index';
import { loadCatalog } from './matcher/catalog';
import { Matcher } from './matcher/matcher';
import { allSources, getAdapter, SOURCES_CONFIG } from './sources.config';
import { modelIdMap, sourceId, syncCatalog } from './store/catalog';
import { ingestMeta } from './store/meta';
import { pendingReview, persistReviewQueue, resolveCoveredItems, writeReviewJson } from './store/review';
import { ingestScores, recomputeSnapshotPercentiles, refreshLatest } from './store/scores';
import type { FetchOptions } from './types';

export interface RunOptions extends FetchOptions {
  /** Restrict to these source ids (must be enabled). Default: all enabled sources. */
  only?: string[];
  runMode: 'run' | 'backfill' | 'seed';
  log?: (msg: string) => void;
}

export interface SourceRunResult {
  source: string;
  status: 'ok' | 'warn' | 'failed';
  stats?: Record<string, unknown>;
  warnings: string[];
  error?: string;
}

export interface RunSummary {
  results: SourceRunResult[];
  compute: Awaited<ReturnType<typeof runCompute>> | null;
  reviewPending: number;
  ok: boolean;
}

/** fetch → parse → match → validate → write per enabled source, then compute + review queue. */
export async function runPipeline(db: Db, opts: RunOptions): Promise<RunSummary> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const catalog = await loadCatalog();
  await syncCatalog(db, catalog, allSources());
  const modelIds = await modelIdMap(db);
  const matcher = new Matcher(catalog.models);

  const targets = SOURCES_CONFIG.filter((s) => {
    if (opts.only?.length) {
      if (!opts.only.includes(s.adapter.id)) return false;
      if (!s.enabled) {
        log(`skip ${s.adapter.id}: disabled in sources.config.ts`);
        return false;
      }
      return true;
    }
    return s.enabled;
  });
  if (opts.only?.length) {
    for (const id of opts.only) if (!getAdapter(id)) throw new Error(`unknown source "${id}"`);
  }

  const results: SourceRunResult[] = [];
  for (const { adapter } of targets) {
    const [run] = await db
      .insert(pipelineRuns)
      .values({ sourceSlug: adapter.id, mode: opts.runMode, status: 'running' })
      .returning({ id: pipelineRuns.id });
    const runId = run!.id;
    try {
      log(`[${adapter.id}] fetching (${opts.mode}${opts.fixtureDir ? ', fixtures' : ''})`);
      const raw = await adapter.fetch(opts);
      let stats: Record<string, unknown>;
      let warnings: string[] = [];
      let rejected = 0;
      if (adapter.kind === 'scores') {
        const rows = adapter.parse(raw as never);
        log(`[${adapter.id}] parsed ${rows.length} rows`);
        const s = await ingestScores(db, adapter.id, await sourceId(db, adapter.id), rows, matcher, modelIds, runId);
        warnings = [...s.warnings, ...s.rejections.map((r) => `REJECTED ${r}`)];
        rejected = s.snapshotsRejected;
        const { warnings: _w, rejections: _r, ...rest } = s;
        stats = rest;
      } else {
        const rows = adapter.parse(raw as never);
        log(`[${adapter.id}] parsed ${rows.length} metadata rows`);
        stats = { ...(await ingestMeta(db, adapter.id, rows, matcher, modelIds)) };
      }
      const status = rejected > 0 || warnings.length > 0 ? 'warn' : 'ok';
      await db
        .update(pipelineRuns)
        .set({ status, finishedAt: sql`now()`, stats, warnings })
        .where(eq(pipelineRuns.id, runId));
      results.push({ source: adapter.id, status, stats, warnings });
      log(`[${adapter.id}] ${status} ${JSON.stringify(stats)}`);
    } catch (err) {
      // Critical (e.g. schema mismatch): nothing from this batch was written; last good data stays live.
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(pipelineRuns)
        .set({ status: 'failed', finishedAt: sql`now()`, error: message })
        .where(eq(pipelineRuns.id, runId));
      results.push({ source: adapter.id, status: 'failed', warnings: [], error: message });
      log(`[${adapter.id}] FAILED: ${message}`);
    }
  }

  await persistReviewQueue(db, matcher.reviewQueue());
  await resolveCoveredItems(db, (src, name) => matcher.lookup(src, name) != null);
  const compute = results.some((r) => r.status !== 'failed') ? await runCompute(db) : null;
  if (compute) log(`[compute] ${JSON.stringify(compute)}`);
  const pending = await pendingReview(db);
  await writeReviewJson(pending);

  const summary: RunSummary = { results, compute, reviewPending: pending.length, ok: results.every((r) => r.status !== 'failed') };
  await notify(
    summary.ok ? (results.some((r) => r.status === 'warn') ? 'warn' : 'ok') : 'failed',
    `ai-leaderboard pipeline ${opts.runMode}`,
    [
      ...results.map((r) => `${r.source}: ${r.status}${r.error ? ` — ${r.error}` : ''} ${r.stats ? JSON.stringify(r.stats) : ''}`),
      `review queue: ${pending.length} pending`,
    ],
  );
  return summary;
}

/** Re-match stored unmatched entries after aliases.yaml changed (no re-fetch), then recompute. */
export async function rematch(db: Db, log: (m: string) => void = console.log): Promise<{ updated: number; snapshots: number }> {
  const catalog = await loadCatalog();
  await syncCatalog(db, catalog, allSources());
  const modelIds = await modelIdMap(db);
  const matcher = new Matcher(catalog.models);
  const rows = await db
    .select({
      id: leaderboardEntries.id,
      rawName: leaderboardEntries.rawName,
      snapshotId: leaderboardEntries.snapshotId,
      source: sources.slug,
      higherIsBetter: leaderboards.higherIsBetter,
      leaderboardId: leaderboards.id,
    })
    .from(leaderboardEntries)
    .innerJoin(snapshots, eq(snapshots.id, leaderboardEntries.snapshotId))
    .innerJoin(leaderboards, eq(leaderboards.id, snapshots.leaderboardId))
    .innerJoin(sources, eq(sources.id, leaderboards.sourceId))
    .where(and(isNull(leaderboardEntries.modelId), eq(sources.enabled, true)));
  const touched = new Map<number, { higherIsBetter: boolean; leaderboardId: number }>();
  let updated = 0;
  for (const r of rows) {
    const hit = matcher.lookup(r.source, r.rawName);
    const modelId = hit ? modelIds.get(hit.modelSlug) : undefined;
    if (!hit || modelId == null) continue;
    await db.update(leaderboardEntries).set({ modelId, variantKey: hit.variantKey }).where(eq(leaderboardEntries.id, r.id));
    touched.set(r.snapshotId, { higherIsBetter: r.higherIsBetter, leaderboardId: r.leaderboardId });
    updated++;
  }
  for (const [snapshotId, { higherIsBetter }] of touched) await recomputeSnapshotPercentiles(db, snapshotId, higherIsBetter);
  if (touched.size) {
    await db.execute(sql`
      UPDATE snapshots s SET matched_count = (SELECT count(*) FROM leaderboard_entries e WHERE e.snapshot_id = s.id AND e.model_id IS NOT NULL)
      WHERE s.id IN (${sql.join([...touched.keys()].map((id) => sql`${id}`), sql`, `)})`);
    for (const lbId of new Set([...touched.values()].map((t) => t.leaderboardId))) await refreshLatest(db, lbId);
  }
  await resolveCoveredItems(db, (src, name) => matcher.lookup(src, name) != null);
  await writeReviewJson(await pendingReview(db));
  const compute = await runCompute(db);
  log(`rematched ${updated} entries in ${touched.size} snapshots; compute ${JSON.stringify(compute)}`);
  return { updated, snapshots: touched.size };
}

