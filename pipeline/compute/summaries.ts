import type { DisagreementPair, PerLeaderboardEntry } from '@ail/db/schema';
import { THRESHOLDS } from '../config/thresholds';
import { median } from './percentile';

/** Board used for "overall" rank and movers. */
export const PRIMARY_BOARD = 'lmarena-text-overall';

export interface LatestEntry extends PerLeaderboardEntry {
  modelId: number;
}

export interface HistoryPoint {
  modelId: number;
  leaderboard: string;
  publishedAt: string;
  rank: number | null;
  percentile: number | null;
}

export interface Summary {
  modelId: number;
  coverage: number;
  sourceCount: number;
  medianPercentile: number | null;
  bestPercentile: number | null;
  worstPercentile: number | null;
  overallPercentile: number | null;
  disagreementScore: number | null;
  disagreementFlag: 'none' | 'flagged';
  disagreementPair: DisagreementPair | null;
  rankDelta7d: number | null;
  rankDelta30d: number | null;
  perLeaderboard: PerLeaderboardEntry[];
}

const round = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);

/** Keep the best-percentile variant per (model, leaderboard). */
export function bestVariantPerBoard(entries: LatestEntry[]): LatestEntry[] {
  const best = new Map<string, LatestEntry>();
  for (const e of entries) {
    const k = `${e.modelId}|${e.leaderboard}`;
    const prev = best.get(k);
    if (!prev || e.percentile > prev.percentile) best.set(k, e);
  }
  return [...best.values()];
}

/**
 * Disagreement: within each unified category, spread = max − min percentile across that model's
 * boards (≥ 2 boards needed). The model's score is the largest spread over its categories; it is
 * flagged when the spread ≥ threshold. Comparing only within a category avoids "math vs. Chinese" noise.
 */
export function computeDisagreement(
  boards: PerLeaderboardEntry[],
  threshold: number = THRESHOLDS.disagreementPoints,
): { score: number | null; flag: 'none' | 'flagged'; pair: DisagreementPair | null } {
  const byCat = new Map<string, PerLeaderboardEntry[]>();
  for (const b of boards) byCat.set(b.category, [...(byCat.get(b.category) ?? []), b]);
  let best: DisagreementPair | null = null;
  let bestSpread = -1;
  for (const [category, list] of byCat) {
    if (list.length < 2) continue;
    const hi = list.reduce((a, b) => (b.percentile > a.percentile ? b : a));
    const lo = list.reduce((a, b) => (b.percentile < a.percentile ? b : a));
    const spread = hi.percentile - lo.percentile;
    if (spread > bestSpread) {
      bestSpread = spread;
      best = {
        category,
        high: { leaderboard: hi.leaderboard, percentile: hi.percentile, rank: hi.rank },
        low: { leaderboard: lo.leaderboard, percentile: lo.percentile, rank: lo.rank },
      };
    }
  }
  if (bestSpread < 0) return { score: null, flag: 'none', pair: null };
  const score = round(bestSpread)!;
  return { score, flag: score >= threshold ? 'flagged' : 'none', pair: best };
}

/** Rank change on the primary board vs. the latest point at least `days` before the newest one (positive = moved up). */
export function rankDelta(points: HistoryPoint[], days: number): number | null {
  const pts = points.filter((p) => p.leaderboard === PRIMARY_BOARD && p.rank != null).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const last = pts.at(-1);
  if (!last) return null;
  const cutoff = new Date(Date.parse(last.publishedAt) - days * 86_400_000).toISOString().slice(0, 10);
  const before = pts.filter((p) => p.publishedAt <= cutoff).at(-1);
  if (!before) return null;
  return before.rank! - last.rank!;
}

export function summarize(modelId: number, latest: LatestEntry[], history: HistoryPoint[], threshold?: number): Summary {
  const boards = bestVariantPerBoard(latest.filter((e) => e.modelId === modelId))
    .map(({ modelId: _m, ...rest }) => rest)
    .sort((a, b) => b.percentile - a.percentile || a.leaderboard.localeCompare(b.leaderboard));
  const ps = boards.map((b) => b.percentile);
  const d = computeDisagreement(boards, threshold);
  const primary = boards.find((b) => b.leaderboard === PRIMARY_BOARD);
  const hist = history.filter((h) => h.modelId === modelId);
  return {
    modelId,
    coverage: boards.length,
    sourceCount: new Set(boards.map((b) => b.source)).size,
    medianPercentile: round(median(ps)),
    bestPercentile: ps.length ? Math.max(...ps) : null,
    worstPercentile: ps.length ? Math.min(...ps) : null,
    overallPercentile: primary ? primary.percentile : null,
    disagreementScore: d.score,
    disagreementFlag: d.flag,
    disagreementPair: d.pair,
    rankDelta7d: rankDelta(hist, 7),
    rankDelta30d: rankDelta(hist, 30),
    perLeaderboard: boards,
  };
}
