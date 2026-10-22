import { leaderboardEntries, leaderboards, snapshots, type Db } from '@ail/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import { sha256 } from '../adapters/base';
import { computePercentiles } from '../compute/percentile';
import type { Matcher } from '../matcher/matcher';
import type { NormalizedScore } from '../types';
import { top10, validateSnapshot } from '../validate/checks';

export interface ScoreIngestStats {
  rows: number;
  matchedRows: number;
  snapshotsInserted: number;
  snapshotsSkipped: number;
  snapshotsRejected: number;
  leaderboards: number;
  warnings: string[];
  rejections: string[];
}

export function contentHash(rows: NormalizedScore[]): string {
  const canon = rows
    .map((r) => [r.rawName, r.rank, r.score, r.scoreLower, r.scoreUpper, r.votes])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return sha256(JSON.stringify(canon));
}

export function groupByBoardAndDate(rows: NormalizedScore[]): Map<string, Map<string, NormalizedScore[]>> {
  const out = new Map<string, Map<string, NormalizedScore[]>>();
  for (const r of rows) {
    const byDate = out.get(r.leaderboard.boardKey) ?? new Map<string, NormalizedScore[]>();
    byDate.set(r.publishedAt, [...(byDate.get(r.publishedAt) ?? []), r]);
    out.set(r.leaderboard.boardKey, byDate);
  }
  return out;
}

interface ExistingSnap {
  id: number;
  publishedAt: string;
  contentHash: string;
  status: string;
  rowCount: number;
}

/**
 * Write one source's parsed rows: one snapshot per (leaderboard, published date), deduplicated by
 * content hash, validated against the previous good snapshot. Critical failures are stored as
 * status='rejected' (kept for inspection, never latest, never published). Single transaction.
 */
export async function ingestScores(
  db: Db,
  sourceSlug: string,
  srcId: number,
  rows: NormalizedScore[],
  matcher: Matcher,
  modelIds: Map<string, number>,
  runId: number | null,
): Promise<ScoreIngestStats> {
  const stats: ScoreIngestStats = {
    rows: 0,
    matchedRows: 0,
    snapshotsInserted: 0,
    snapshotsSkipped: 0,
    snapshotsRejected: 0,
    leaderboards: 0,
    warnings: [],
    rejections: [],
  };
  const grouped = groupByBoardAndDate(rows);

  await db.transaction(async (tx) => {
    for (const [boardKey, byDate] of grouped) {
      stats.leaderboards++;
      const def = [...byDate.values()][0]![0]!.leaderboard;
      const slug = `${sourceSlug}-${boardKey}`;
      const lbValues = {
        slug,
        sourceId: srcId,
        boardKey,
        name: def.name,
        category: def.category,
        categoryRaw: def.categoryRaw,
        scoreType: def.scoreType,
        higherIsBetter: def.higherIsBetter,
        externalUrl: def.externalUrl,
      };
      const [lb] = await tx
        .insert(leaderboards)
        .values(lbValues)
        .onConflictDoUpdate({ target: leaderboards.slug, set: lbValues })
        .returning({ id: leaderboards.id });
      const lbId = lb!.id;

      const existing: ExistingSnap[] = await tx
        .select({
          id: snapshots.id,
          publishedAt: snapshots.publishedAt,
          contentHash: snapshots.contentHash,
          status: snapshots.status,
          rowCount: snapshots.rowCount,
        })
        .from(snapshots)
        .where(eq(snapshots.leaderboardId, lbId))
        .orderBy(asc(snapshots.publishedAt), asc(snapshots.id));

      const top10Cache = new Map<number, string[]>();
      const prevTop10 = async (id: number): Promise<string[]> => {
        if (!top10Cache.has(id)) {
          const r = await tx
            .select({ rawName: leaderboardEntries.rawName, rank: leaderboardEntries.rank })
            .from(leaderboardEntries)
            .where(eq(leaderboardEntries.snapshotId, id));
          top10Cache.set(id, top10(r));
        }
        return top10Cache.get(id)!;
      };

      for (const date of [...byDate.keys()].sort()) {
        const group = byDate.get(date)!;
        stats.rows += group.length;
        const hash = contentHash(group);
        if (existing.some((s) => s.publishedAt === date && s.contentHash === hash)) {
          stats.snapshotsSkipped++;
          continue;
        }
        const okSnaps = existing.filter((s) => s.status === 'ok');
        const latestOk = okSnaps.at(-1);
        // Sources without a publish date (Epoch) re-date unchanged data daily: skip it.
        if (latestOk && latestOk.contentHash === hash && latestOk.publishedAt <= date) {
          stats.snapshotsSkipped++;
          continue;
        }
        const prev = okSnaps.filter((s) => s.publishedAt <= date).at(-1) ?? null;

        const matched = group.map((r) => {
          const m = matcher.match(sourceSlug, r.rawName, r.rawOrg);
          const modelId = m.matched ? (modelIds.get(m.modelSlug) ?? null) : null;
          return { row: r, modelId, variantKey: m.matched ? m.variantKey : '' };
        });
        const matchedCount = matched.filter((m) => m.modelId != null).length;
        stats.matchedRows += matchedCount;

        const v = validateSnapshot(
          {
            leaderboardSlug: `${slug}@${date}`,
            scoreType: def.scoreType,
            categoryMapped: def.categoryMapped,
            rows: matched.map((m) => ({ rawName: m.row.rawName, score: m.row.score, rank: m.row.rank, matched: m.modelId != null })),
          },
          prev ? { rowCount: prev.rowCount, top10: await prevTop10(prev.id) } : null,
        );
        stats.warnings.push(...v.warn);
        const status = v.critical.length ? 'rejected' : 'ok';
        if (status === 'rejected') {
          stats.snapshotsRejected++;
          stats.rejections.push(...v.critical);
        }

        const [snap] = await tx
          .insert(snapshots)
          .values({
            leaderboardId: lbId,
            publishedAt: date,
            batchKey: group[0]!.batchKey,
            contentHash: hash,
            rowCount: group.length,
            matchedCount,
            status,
            rejectReason: v.critical.join('\n') || null,
            runId,
          })
          .returning({ id: snapshots.id });
        stats.snapshotsInserted++;
        existing.push({ id: snap!.id, publishedAt: date, contentHash: hash, status, rowCount: group.length });
        existing.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id - b.id);

        const pct = computePercentiles(
          matched.map((m, i) => ({ id: i, matched: m.modelId != null, rank: m.row.rank, score: m.row.score })),
          def.higherIsBetter,
        );
        const values = matched.map((m, i) => ({
          snapshotId: snap!.id,
          modelId: m.modelId,
          variantKey: m.variantKey,
          rawName: m.row.rawName,
          rawOrg: m.row.rawOrg,
          rank: m.row.rank,
          score: m.row.score,
          scoreLower: m.row.scoreLower,
          scoreUpper: m.row.scoreUpper,
          votes: m.row.votes,
          percentile: pct.get(i) ?? null,
          redistributable: m.row.redistributable,
          extra: m.row.extra,
        }));
        for (let i = 0; i < values.length; i += 1000) await tx.insert(leaderboardEntries).values(values.slice(i, i + 1000));
      }
      await refreshLatest(tx as unknown as Db, lbId);
    }
  });
  return stats;
}

/** is_latest = newest 'ok' snapshot of the leaderboard (by published date, then capture). */
export async function refreshLatest(db: Db, leaderboardId: number): Promise<void> {
  await db.execute(sql`
    UPDATE snapshots SET is_latest = (id = (
      SELECT id FROM snapshots
      WHERE leaderboard_id = ${leaderboardId} AND status = 'ok'
      ORDER BY published_at DESC, captured_at DESC, id DESC LIMIT 1))
    WHERE leaderboard_id = ${leaderboardId}`);
}

/** Recompute stored percentiles for one snapshot (after re-matching changed which rows are matched). */
export async function recomputeSnapshotPercentiles(db: Db, snapshotId: number, higherIsBetter: boolean): Promise<void> {
  const rows = await db
    .select({ id: leaderboardEntries.id, modelId: leaderboardEntries.modelId, rank: leaderboardEntries.rank, score: leaderboardEntries.score })
    .from(leaderboardEntries)
    .where(and(eq(leaderboardEntries.snapshotId, snapshotId)));
  const pct = computePercentiles(rows.map((r) => ({ id: r.id, matched: r.modelId != null, rank: r.rank, score: r.score })), higherIsBetter);
  for (const r of rows) {
    await db
      .update(leaderboardEntries)
      .set({ percentile: pct.get(r.id) ?? null })
      .where(eq(leaderboardEntries.id, r.id));
  }
}
