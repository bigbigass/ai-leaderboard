/**
 * Read-only queries used by the web app. Every query returns plain JSON-serialisable data
 * (dates as YYYY-MM-DD strings) and only ever exposes published data:
 *   snapshots.status = 'ok', entries with a matched model, sources.enabled = true.
 */
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { Db } from './client';
import {
  leaderboardEntries,
  leaderboards,
  modelHistory,
  modelMeta,
  models,
  modelSummaries,
  snapshots,
  sources,
  vendors,
  type DisagreementPair,
  type PerLeaderboardEntry,
} from './schema';

export interface PriceInfo {
  openrouterId: string;
  prompt: number | null;
  completion: number | null;
  contextLength: number | null;
}

export interface SummaryInfo {
  coverage: number;
  sourceCount: number;
  medianPercentile: number | null;
  bestPercentile: number | null;
  worstPercentile: number | null;
  overallPercentile: number | null;
  disagreementScore: number | null;
  disagreementFlag: string;
  disagreementPair: DisagreementPair | null;
  rankDelta7d: number | null;
  rankDelta30d: number | null;
  perLeaderboard: PerLeaderboardEntry[];
  computedAt: string;
}

export interface ModelListItem {
  id: number;
  slug: string;
  name: string;
  family: string;
  vendorSlug: string;
  vendorName: string;
  country: string;
  openWeights: boolean | null;
  license: string | null;
  paramsTotal: number | null;
  paramsActive: number | null;
  modalities: string[];
  releasedAt: string | null;
  summary: SummaryInfo | null;
  price: PriceInfo | null;
}

export interface SourceInfo {
  slug: string;
  name: string;
  homepage: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string;
  kind: string;
  boardCount: number;
  lastCapturedAt: string | null;
  lastPublishedAt: string | null;
}

export interface BoardInfo {
  slug: string;
  boardKey: string;
  sourceSlug: string;
  sourceName: string;
  name: string;
  category: string;
  categoryRaw: string | null;
  scoreType: string;
  higherIsBetter: boolean;
  externalUrl: string | null;
  latestPublishedAt: string;
  latestCapturedAt: string;
  matchedCount: number;
  rowCount: number;
}

export interface BoardRow {
  modelSlug: string;
  modelName: string;
  vendorSlug: string;
  vendorName: string;
  country: string;
  variant: string;
  rawName: string;
  rank: number | null;
  score: number | null;
  scoreLower: number | null;
  scoreUpper: number | null;
  votes: number | null;
  percentile: number | null;
  redistributable: boolean;
  originalSource: string | null;
  sourceLink: string | null;
}

export interface BoardTable {
  board: BoardInfo;
  publishedAt: string;
  isLatest: boolean;
  rows: BoardRow[];
  historyDates: string[];
}

export interface HistorySeriesPoint {
  leaderboard: string;
  publishedAt: string;
  rank: number | null;
  score: number | null;
  percentile: number | null;
  batchKey: string | null;
}

export interface ModelVariantRow {
  leaderboard: string;
  variant: string;
  rawName: string;
  rank: number | null;
  score: number | null;
  percentile: number | null;
}

export interface ModelDetail {
  model: ModelListItem;
  vendorWebsite: string | null;
  history: HistorySeriesPoint[];
  variants: ModelVariantRow[];
  /** Epoch rows republished from third parties: shown with their original source. */
  externalRows: { leaderboard: string; originalSource: string | null; sourceLink: string | null }[];
}

export interface VendorInfo {
  slug: string;
  name: string;
  country: string;
  website: string | null;
}

const iso = (d: unknown): string | null => {
  if (d == null) return null;
  if (d instanceof Date) return d.toISOString();
  return String(d);
};

export async function getEnabledSources(db: Db): Promise<SourceInfo[]> {
  const rows = await db
    .select({
      slug: sources.slug,
      name: sources.name,
      homepage: sources.homepage,
      license: sources.license,
      licenseUrl: sources.licenseUrl,
      attribution: sources.attribution,
      kind: sources.kind,
      boardCount: sql<number>`(SELECT count(DISTINCT l.id)::int FROM leaderboards l JOIN snapshots s ON s.leaderboard_id = l.id AND s.is_latest AND s.status = 'ok' WHERE l.source_id = "sources"."id")`,
      lastCapturedAt: sql<string | null>`COALESCE(
        (SELECT max(s.captured_at) FROM snapshots s JOIN leaderboards l ON l.id = s.leaderboard_id WHERE l.source_id = "sources"."id" AND s.status = 'ok'),
        CASE WHEN "sources"."kind" = 'metadata' THEN (SELECT max(seen_at) FROM model_meta) END)`,
      lastPublishedAt: sql<string | null>`(SELECT max(s.published_at)::text FROM snapshots s JOIN leaderboards l ON l.id = s.leaderboard_id WHERE l.source_id = "sources"."id" AND s.status = 'ok')`,
    })
    .from(sources)
    .where(eq(sources.enabled, true))
    .orderBy(asc(sources.id));
  return rows.map((r) => ({ ...r, boardCount: Number(r.boardCount), lastCapturedAt: iso(r.lastCapturedAt) }));
}

export async function getModelList(db: Db): Promise<ModelListItem[]> {
  const rows = await db
    .select({
      id: models.id,
      slug: models.slug,
      name: models.displayName,
      family: models.family,
      vendorSlug: vendors.slug,
      vendorName: vendors.name,
      country: vendors.country,
      openWeights: models.openWeights,
      license: models.license,
      paramsTotal: models.paramsTotal,
      paramsActive: models.paramsActive,
      modalities: models.modalities,
      releasedAt: models.releasedAt,
      s: modelSummaries,
      m: modelMeta,
    })
    .from(models)
    .innerJoin(vendors, eq(vendors.id, models.vendorId))
    .leftJoin(modelSummaries, eq(modelSummaries.modelId, models.id))
    .leftJoin(modelMeta, eq(modelMeta.modelId, models.id))
    .where(ne(models.status, 'hidden'))
    .orderBy(asc(models.displayName));
  return rows.map(({ s, m, ...r }) => ({
    ...r,
    summary: s
      ? {
          coverage: s.coverage,
          sourceCount: s.sourceCount,
          medianPercentile: s.medianPercentile,
          bestPercentile: s.bestPercentile,
          worstPercentile: s.worstPercentile,
          overallPercentile: s.overallPercentile,
          disagreementScore: s.disagreementScore,
          disagreementFlag: s.disagreementFlag,
          disagreementPair: s.disagreementPair,
          rankDelta7d: s.rankDelta7d,
          rankDelta30d: s.rankDelta30d,
          perLeaderboard: s.perLeaderboard,
          computedAt: iso(s.computedAt)!,
        }
      : null,
    price: m
      ? { openrouterId: m.openrouterId, prompt: m.pricePromptPerM, completion: m.priceCompletionPerM, contextLength: m.contextLength }
      : null,
  }));
}

export async function getVendors(db: Db): Promise<VendorInfo[]> {
  return db
    .select({ slug: vendors.slug, name: vendors.name, country: vendors.country, website: vendors.website })
    .from(vendors)
    .orderBy(asc(vendors.name));
}

export async function getBoards(db: Db): Promise<BoardInfo[]> {
  const rows = await db
    .select({
      slug: leaderboards.slug,
      boardKey: leaderboards.boardKey,
      sourceSlug: sources.slug,
      sourceName: sources.name,
      name: leaderboards.name,
      category: leaderboards.category,
      categoryRaw: leaderboards.categoryRaw,
      scoreType: leaderboards.scoreType,
      higherIsBetter: leaderboards.higherIsBetter,
      externalUrl: leaderboards.externalUrl,
      latestPublishedAt: snapshots.publishedAt,
      latestCapturedAt: snapshots.capturedAt,
      matchedCount: snapshots.matchedCount,
      rowCount: snapshots.rowCount,
    })
    .from(leaderboards)
    .innerJoin(sources, eq(sources.id, leaderboards.sourceId))
    .innerJoin(snapshots, and(eq(snapshots.leaderboardId, leaderboards.id), eq(snapshots.isLatest, true), eq(snapshots.status, 'ok')))
    .where(and(eq(sources.enabled, true), sql`${snapshots.matchedCount} > 0`))
    .orderBy(asc(sources.id), asc(leaderboards.slug));
  return rows.map((r) => ({ ...r, latestCapturedAt: iso(r.latestCapturedAt)! }));
}

/** Board table for the latest snapshot, or the newest 'ok' snapshot published on `date`. */
export async function getBoardTable(db: Db, sourceSlug: string, boardKey: string, date?: string): Promise<BoardTable | null> {
  const boards = await getBoards(db);
  const board = boards.find((b) => b.sourceSlug === sourceSlug && b.boardKey === boardKey);
  if (!board) return null;
  const [lb] = await db.select({ id: leaderboards.id }).from(leaderboards).where(eq(leaderboards.slug, board.slug));
  if (!lb) return null;
  const snapWhere = date
    ? and(eq(snapshots.leaderboardId, lb.id), eq(snapshots.status, 'ok'), eq(snapshots.publishedAt, date))
    : and(eq(snapshots.leaderboardId, lb.id), eq(snapshots.isLatest, true));
  const [snap] = await db
    .select({ id: snapshots.id, publishedAt: snapshots.publishedAt, isLatest: snapshots.isLatest })
    .from(snapshots)
    .where(snapWhere)
    .orderBy(desc(snapshots.capturedAt), desc(snapshots.id))
    .limit(1);
  if (!snap) return null;
  const rows = await db
    .select({
      modelSlug: models.slug,
      modelName: models.displayName,
      vendorSlug: vendors.slug,
      vendorName: vendors.name,
      country: vendors.country,
      variant: leaderboardEntries.variantKey,
      rawName: leaderboardEntries.rawName,
      rank: leaderboardEntries.rank,
      score: leaderboardEntries.score,
      scoreLower: leaderboardEntries.scoreLower,
      scoreUpper: leaderboardEntries.scoreUpper,
      votes: leaderboardEntries.votes,
      percentile: leaderboardEntries.percentile,
      redistributable: leaderboardEntries.redistributable,
      extra: leaderboardEntries.extra,
    })
    .from(leaderboardEntries)
    .innerJoin(models, eq(models.id, leaderboardEntries.modelId))
    .innerJoin(vendors, eq(vendors.id, models.vendorId))
    .where(and(eq(leaderboardEntries.snapshotId, snap.id), isNotNull(leaderboardEntries.modelId), ne(models.status, 'hidden')))
    .orderBy(sql`${leaderboardEntries.rank} ASC NULLS LAST`, desc(leaderboardEntries.score));
  const dates = await db
    .selectDistinct({ d: snapshots.publishedAt })
    .from(snapshots)
    .where(and(eq(snapshots.leaderboardId, lb.id), eq(snapshots.status, 'ok')))
    .orderBy(desc(snapshots.publishedAt));
  return {
    board,
    publishedAt: snap.publishedAt,
    isLatest: snap.isLatest,
    rows: rows.map(({ extra, ...r }) => ({
      ...r,
      originalSource: (extra?.originalSource as string | null | undefined) ?? null,
      sourceLink: (extra?.sourceLink as string | null | undefined) ?? null,
    })),
    historyDates: dates.map((d) => d.d),
  };
}

export async function getModelDetail(db: Db, slug: string): Promise<ModelDetail | null> {
  const all = await getModelList(db);
  const model = all.find((m) => m.slug === slug);
  if (!model) return null;
  const [v] = await db.select({ website: vendors.website }).from(vendors).where(eq(vendors.slug, model.vendorSlug));
  const enabledBoards = db
    .select({ id: leaderboards.id })
    .from(leaderboards)
    .innerJoin(sources, eq(sources.id, leaderboards.sourceId))
    .where(eq(sources.enabled, true));
  const history = await db
    .select({
      leaderboard: leaderboards.slug,
      publishedAt: modelHistory.publishedAt,
      rank: modelHistory.rank,
      score: modelHistory.score,
      percentile: modelHistory.percentile,
      batchKey: modelHistory.batchKey,
    })
    .from(modelHistory)
    .innerJoin(leaderboards, eq(leaderboards.id, modelHistory.leaderboardId))
    .where(and(eq(modelHistory.modelId, model.id), inArray(modelHistory.leaderboardId, enabledBoards)))
    .orderBy(asc(leaderboards.slug), asc(modelHistory.publishedAt));
  const latestRows = await db
    .select({
      leaderboard: leaderboards.slug,
      variant: leaderboardEntries.variantKey,
      rawName: leaderboardEntries.rawName,
      rank: leaderboardEntries.rank,
      score: leaderboardEntries.score,
      percentile: leaderboardEntries.percentile,
      redistributable: leaderboardEntries.redistributable,
      extra: leaderboardEntries.extra,
    })
    .from(leaderboardEntries)
    .innerJoin(snapshots, eq(snapshots.id, leaderboardEntries.snapshotId))
    .innerJoin(leaderboards, eq(leaderboards.id, snapshots.leaderboardId))
    .where(and(eq(leaderboardEntries.modelId, model.id), eq(snapshots.isLatest, true), eq(snapshots.status, 'ok'), inArray(leaderboards.id, enabledBoards)))
    .orderBy(asc(leaderboards.slug), asc(leaderboardEntries.rank));
  return {
    model,
    vendorWebsite: v?.website ?? null,
    history,
    variants: latestRows.map(({ redistributable: _r, extra: _e, ...r }) => r),
    externalRows: latestRows
      .filter((r) => !r.redistributable)
      .map((r) => ({
        leaderboard: r.leaderboard,
        originalSource: (r.extra?.originalSource as string | null | undefined) ?? null,
        sourceLink: (r.extra?.sourceLink as string | null | undefined) ?? null,
      })),
  };
}
