import { describe, expect, it } from 'vitest';
import { validateSnapshot, type SnapshotCandidate } from '../validate/checks';

const rows = (n: number, o: Partial<SnapshotCandidate['rows'][number]> = {}) =>
  Array.from({ length: n }, (_, i) => ({ rawName: `m${i}`, score: 1300 - i, rank: i + 1, matched: true, ...o }));
const snap = (r: SnapshotCandidate['rows'], o: Partial<SnapshotCandidate> = {}): SnapshotCandidate => ({ leaderboardSlug: 'lb', scoreType: 'elo', categoryMapped: true, rows: r, ...o });

describe('validateSnapshot', () => {
  it('passes a healthy snapshot', () => {
    expect(validateSnapshot(snap(rows(20)), { rowCount: 20, top10: rows(10).map((r) => r.rawName) })).toEqual({ critical: [], warn: [] });
  });

  it('critical: row count drops by more than 30%', () => {
    expect(validateSnapshot(snap(rows(13)), { rowCount: 20, top10: [] }).critical[0]).toMatch(/row count dropped 20 → 13/);
    expect(validateSnapshot(snap(rows(14)), { rowCount: 20, top10: [] }).critical).toEqual([]);
  });

  it('critical: all scores null, empty, or out of range', () => {
    expect(validateSnapshot(snap(rows(5, { score: null })), null).critical).toContainEqual(expect.stringMatching(/all scores are null/));
    expect(validateSnapshot(snap([]), null).critical).toContainEqual(expect.stringMatching(/empty/));
    expect(validateSnapshot(snap(rows(3, { score: 140 }), { scoreType: 'percent' }), null).critical[0]).toMatch(/outside 0–100/);
  });

  it('rank_only boards may have null scores', () => {
    expect(validateSnapshot(snap(rows(5, { score: null }), { scoreType: 'rank_only' }), null).critical).toEqual([]);
  });

  it('warn: low match rate, unmapped category, Top-10 churn', () => {
    const r = rows(10).map((x, i) => ({ ...x, matched: i < 5 }));
    const v = validateSnapshot(snap(r, { categoryMapped: false }), { rowCount: 10, top10: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] });
    expect(v.critical).toEqual([]);
    expect(v.warn).toHaveLength(3);
  });
});
