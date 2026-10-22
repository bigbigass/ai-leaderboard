import { describe, expect, it } from 'vitest';
import { computePercentiles, median } from '../compute/percentile';
import { bestVariantPerBoard, computeDisagreement, PRIMARY_BOARD, rankDelta, summarize, type LatestEntry } from '../compute/summaries';

describe('computePercentiles', () => {
  it('uses only matched rows: (N - r + 1) / N × 100', () => {
    const p = computePercentiles([
      { id: 1, matched: true, rank: 1, score: 1400 },
      { id: 2, matched: false, rank: 2, score: 1390 },
      { id: 3, matched: true, rank: 3, score: 1380 },
      { id: 4, matched: true, rank: 4, score: 1370 },
      { id: 5, matched: true, rank: 5, score: 1360 },
    ]);
    expect([...p.entries()]).toEqual([
      [1, 100],
      [3, 75],
      [4, 50],
      [5, 25],
    ]);
  });

  it('shares percentile on ties and falls back to score order without ranks', () => {
    const tied = computePercentiles([
      { id: 1, matched: true, rank: 1, score: 1 },
      { id: 2, matched: true, rank: 1, score: 1 },
      { id: 3, matched: true, rank: 3, score: 1 },
    ]);
    expect(tied.get(1)).toBe(100);
    expect(tied.get(2)).toBe(100);
    expect(tied.get(3)).toBeCloseTo(33.33, 2);
    const byScore = computePercentiles([
      { id: 1, matched: true, rank: null, score: 50 },
      { id: 2, matched: true, rank: null, score: 90 },
    ]);
    expect(byScore.get(2)).toBe(100);
    expect(byScore.get(1)).toBe(50);
    const lowerBetter = computePercentiles([
      { id: 1, matched: true, rank: null, score: 50 },
      { id: 2, matched: true, rank: null, score: 90 },
    ], false);
    expect(lowerBetter.get(1)).toBe(100);
  });

  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

const e = (o: Partial<LatestEntry>): LatestEntry => ({
  modelId: 1,
  leaderboard: 'lb',
  source: 'lmarena',
  category: 'coding',
  rank: 1,
  score: 1,
  scoreLower: null,
  scoreUpper: null,
  percentile: 50,
  variant: '',
  rawName: 'x',
  publishedAt: '2025-09-30',
  ...o,
});

describe('disagreement', () => {
  it('flags a spread ≥ threshold within one category and records the pair', () => {
    const d = computeDisagreement([e({ leaderboard: 'a', percentile: 90 }), e({ leaderboard: 'b', percentile: 60 }), e({ leaderboard: 'c', category: 'math', percentile: 10 })]);
    expect(d).toEqual({
      score: 30,
      flag: 'flagged',
      pair: { category: 'coding', high: { leaderboard: 'a', percentile: 90, rank: 1 }, low: { leaderboard: 'b', percentile: 60, rank: 1 } },
    });
  });

  it('never compares across categories', () => {
    expect(computeDisagreement([e({ leaderboard: 'a', percentile: 100 }), e({ leaderboard: 'b', category: 'math', percentile: 0 })])).toEqual({ score: null, flag: 'none', pair: null });
  });

  it('respects a configurable threshold', () => {
    const boards = [e({ leaderboard: 'a', percentile: 80 }), e({ leaderboard: 'b', percentile: 60 })];
    expect(computeDisagreement(boards).flag).toBe('none');
    expect(computeDisagreement(boards, 15).flag).toBe('flagged');
  });
});

describe('summaries', () => {
  it('keeps the best variant per board', () => {
    const best = bestVariantPerBoard([e({ variant: 'reasoning=off', percentile: 40 }), e({ variant: 'reasoning=on', percentile: 70 })]);
    expect(best).toHaveLength(1);
    expect(best[0]!.variant).toBe('reasoning=on');
  });

  it('computes rank deltas on the primary board', () => {
    const pts = [
      { modelId: 1, leaderboard: PRIMARY_BOARD, publishedAt: '2025-08-01', rank: 9, percentile: 1 },
      { modelId: 1, leaderboard: PRIMARY_BOARD, publishedAt: '2025-09-20', rank: 6, percentile: 1 },
      { modelId: 1, leaderboard: PRIMARY_BOARD, publishedAt: '2025-09-30', rank: 4, percentile: 1 },
    ];
    expect(rankDelta(pts, 7)).toBe(2);
    expect(rankDelta(pts, 30)).toBe(5);
    expect(rankDelta(pts, 365)).toBeNull();
  });

  it('summarizes coverage, sources, median and overall percentile', () => {
    const latest = [
      e({ leaderboard: PRIMARY_BOARD, category: 'overall', percentile: 80 }),
      e({ leaderboard: 'epoch-x', source: 'epoch', percentile: 40 }),
      e({ leaderboard: 'lmarena-c', percentile: 90 }),
      e({ modelId: 2, percentile: 10 }),
    ];
    const s = summarize(1, latest, []);
    expect(s).toMatchObject({ coverage: 3, sourceCount: 2, medianPercentile: 80, bestPercentile: 90, worstPercentile: 40, overallPercentile: 80, disagreementScore: 50, disagreementFlag: 'flagged' });
    expect(s.perLeaderboard.map((p) => p.leaderboard)).toEqual(['lmarena-c', PRIMARY_BOARD, 'epoch-x']);
  });
});
