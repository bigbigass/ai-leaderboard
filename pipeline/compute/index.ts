import { leaderboardEntries, leaderboards, modelHistory, modelSummaries, snapshots, sources, type Db } from '@ail/db';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { PRIMARY_BOARD, summarize, type HistoryPoint, type LatestEntry } from './summaries';

/**
 * Full recompute of derived tables from published data (status='ok', enabled sources):
 * model_history (best variant per model/board/date) and model_summaries.
 */
export async function runCompute(db: Db): Promise<{ models: number; historyRows: number; flagged: number }> {
  return db.transaction(async (tx) => {
    await tx.delete(modelHistory);
    await tx.execute(sql`
      INSERT INTO model_history (model_id, leaderboard_id, published_at, rank, score, percentile, batch_key)
      SELECT DISTINCT ON (e.model_id, s.leaderboard_id, s.published_at)
             e.model_id, s.leaderboard_id, s.published_at, e.rank, e.score, e.percentile, s.batch_key
      FROM leaderboard_entries e
      JOIN snapshots s ON s.id = e.snapshot_id
      JOIN leaderboards l ON l.id = s.leaderboard_id
      JOIN sources src ON src.id = l.source_id
      WHERE s.status = 'ok' AND src.enabled AND e.model_id IS NOT NULL
      ORDER BY e.model_id, s.leaderboard_id, s.published_at, e.percentile DESC NULLS LAST, s.captured_at DESC, s.id DESC`);
    const [{ n: historyRows } = { n: 0 }] = (await tx.execute(sql`SELECT count(*)::int AS n FROM model_history`)) as unknown as { n: number }[];

    const latestRows = await tx
      .select({
        modelId: leaderboardEntries.modelId,
        leaderboard: leaderboards.slug,
        source: sources.slug,
        category: leaderboards.category,
        rank: leaderboardEntries.rank,
        score: leaderboardEntries.score,
        scoreLower: leaderboardEntries.scoreLower,
        scoreUpper: leaderboardEntries.scoreUpper,
        percentile: leaderboardEntries.percentile,
        variant: leaderboardEntries.variantKey,
        rawName: leaderboardEntries.rawName,
        publishedAt: snapshots.publishedAt,
      })
      .from(leaderboardEntries)
      .innerJoin(snapshots, eq(snapshots.id, leaderboardEntries.snapshotId))
      .innerJoin(leaderboards, eq(leaderboards.id, snapshots.leaderboardId))
      .innerJoin(sources, eq(sources.id, leaderboards.sourceId))
      .where(and(eq(snapshots.isLatest, true), eq(snapshots.status, 'ok'), eq(sources.enabled, true), isNotNull(leaderboardEntries.modelId)));
    const latest: LatestEntry[] = latestRows
      .filter((r) => r.percentile != null)
      .map((r) => ({ ...r, modelId: r.modelId!, percentile: r.percentile! }));

    const historyRowsPrimary = (await tx.execute(sql`
      SELECT h.model_id AS "modelId", l.slug AS leaderboard, h.published_at::text AS "publishedAt", h.rank, h.percentile
      FROM model_history h JOIN leaderboards l ON l.id = h.leaderboard_id
      WHERE l.slug = ${PRIMARY_BOARD}`)) as unknown as HistoryPoint[];

    const modelIds = [...new Set(latest.map((e) => e.modelId))];
    const summaries = modelIds.map((id) => summarize(id, latest, historyRowsPrimary));
    await tx.delete(modelSummaries);
    for (let i = 0; i < summaries.length; i += 200) {
      const chunk = summaries.slice(i, i + 200);
      if (chunk.length) await tx.insert(modelSummaries).values(chunk);
    }
    return { models: summaries.length, historyRows: Number(historyRows), flagged: summaries.filter((s) => s.disagreementFlag === 'flagged').length };
  });
}
