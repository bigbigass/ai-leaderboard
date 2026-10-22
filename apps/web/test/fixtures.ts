import type { BoardInfo, ModelListItem } from '@ail/db/queries';
import type { PerLeaderboardEntry } from '@ail/db/schema';

export const entry = (leaderboard: string, percentile: number, o: Partial<PerLeaderboardEntry> = {}): PerLeaderboardEntry => ({
  leaderboard,
  source: leaderboard.split('-')[0]!,
  category: 'overall',
  rank: 1,
  score: 1,
  scoreLower: null,
  scoreUpper: null,
  percentile,
  variant: '',
  rawName: 'x',
  publishedAt: '2025-09-30',
  ...o,
});

export function model(slug: string, o: Partial<ModelListItem> & { boards?: PerLeaderboardEntry[]; sources?: number } = {}): ModelListItem {
  const boards = o.boards ?? [];
  const ps = boards.map((b) => b.percentile).sort((a, b) => a - b);
  return {
    id: slug.length,
    slug,
    name: slug.toUpperCase(),
    family: 'f',
    vendorSlug: o.vendorSlug ?? 'v',
    vendorName: 'V',
    country: o.country ?? 'US',
    openWeights: null,
    license: null,
    paramsTotal: null,
    paramsActive: null,
    modalities: ['text'],
    releasedAt: null,
    price: o.price ?? null,
    summary: boards.length
      ? {
          coverage: boards.length,
          sourceCount: o.sources ?? new Set(boards.map((b) => b.source)).size,
          medianPercentile: ps[Math.floor(ps.length / 2)]!,
          bestPercentile: Math.max(...ps),
          worstPercentile: Math.min(...ps),
          overallPercentile: null,
          disagreementScore: null,
          disagreementFlag: 'none',
          disagreementPair: null,
          rankDelta7d: null,
          rankDelta30d: null,
          perLeaderboard: boards,
          computedAt: '2025-09-30T00:00:00Z',
        }
      : null,
  };
}

export const board = (slug: string, category = 'overall'): BoardInfo => ({
  slug,
  boardKey: slug.split('-').slice(1).join('-'),
  sourceSlug: slug.split('-')[0]!,
  sourceName: slug.split('-')[0]!,
  name: slug,
  category,
  categoryRaw: null,
  scoreType: 'elo',
  higherIsBetter: true,
  externalUrl: null,
  latestPublishedAt: '2025-09-30',
  latestCapturedAt: '2025-09-30T00:00:00Z',
  matchedCount: 10,
  rowCount: 10,
});
