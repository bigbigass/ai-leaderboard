export interface RankableRow {
  id: number;
  matched: boolean;
  rank: number | null;
  score: number | null;
}

/**
 * Percentile within one snapshot, over *matched* rows only (0–100, 100 = first):
 *   p = (N − r + 1) / N × 100, r = competition rank among matched rows (ties share r).
 * Ordering uses the source's rank when present, else score.
 */
export function computePercentiles(rows: RankableRow[], higherIsBetter = true): Map<number, number> {
  const pool = rows.filter((r) => r.matched && (r.rank != null || r.score != null));
  const key = (r: RankableRow): number =>
    r.rank != null ? r.rank : higherIsBetter ? -(r.score as number) : (r.score as number);
  const hasRank = pool.some((r) => r.rank != null);
  const sorted = [...pool].sort((a, b) => (hasRank ? (a.rank ?? Infinity) - (b.rank ?? Infinity) : key(a) - key(b)));
  const N = sorted.length;
  const out = new Map<number, number>();
  let r = 0;
  let prevKey: number | null = null;
  sorted.forEach((row, i) => {
    const k = hasRank ? (row.rank ?? Infinity) : key(row);
    if (k !== prevKey) r = i + 1;
    prevKey = k;
    out.set(row.id, Math.round(((N - r + 1) / N) * 100 * 100) / 100);
  });
  return out;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
