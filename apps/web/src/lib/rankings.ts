import type { BoardInfo, ModelListItem } from '@ail/db/queries';

export const CATEGORIES = ['overall', 'coding', 'math', 'reasoning', 'knowledge', 'chinese', 'vision', 'writing', 'agent', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const isCategory = (x: string): x is Category => (CATEGORIES as readonly string[]).includes(x);

export const isChinese = (m: Pick<ModelListItem, 'country'>) => m.country === 'CN';

/** Ranked = has at least one published board. Ordered by median percentile, then coverage. */
export function rankModels(list: ModelListItem[]): ModelListItem[] {
  return list
    .filter((m) => (m.summary?.coverage ?? 0) > 0 && m.summary?.medianPercentile != null)
    .sort(
      (a, b) =>
        b.summary!.medianPercentile! - a.summary!.medianPercentile! ||
        b.summary!.coverage - a.summary!.coverage ||
        a.name.localeCompare(b.name),
    );
}

export const topChina = (list: ModelListItem[], n = 10) => rankModels(list).filter(isChinese).slice(0, n);
export const topGlobal = (list: ModelListItem[], n = 10) => rankModels(list).slice(0, n);

export function biggestDisagreements(list: ModelListItem[], n = 5): ModelListItem[] {
  return list
    .filter((m) => m.summary?.disagreementFlag === 'flagged' && m.summary.disagreementScore != null)
    .sort((a, b) => b.summary!.disagreementScore! - a.summary!.disagreementScore!)
    .slice(0, n);
}

/** Biggest rank moves on the primary board vs. ~1 week earlier (falls back to 30 days). */
export function movers(list: ModelListItem[], n = 6): { model: ModelListItem; delta: number; window: '7d' | '30d' }[] {
  const pick = (w: '7d' | '30d') =>
    list
      .map((m) => ({ model: m, delta: (w === '7d' ? m.summary?.rankDelta7d : m.summary?.rankDelta30d) ?? 0, window: w }))
      .filter((x) => x.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.delta - a.delta)
      .slice(0, n);
  const week = pick('7d');
  return week.length ? week : pick('30d');
}

export interface CategoryRow {
  model: ModelListItem;
  medianPercentile: number;
  boards: Record<string, { rank: number | null; percentile: number }>;
}

/** Merged cross-board view for one unified category: median percentile over the model's boards in it. */
export function categoryView(list: ModelListItem[], boards: BoardInfo[], category: string): { boards: BoardInfo[]; rows: CategoryRow[] } {
  const catBoards = boards.filter((b) => b.category === category);
  const slugs = new Set(catBoards.map((b) => b.slug));
  const rows: CategoryRow[] = [];
  for (const m of list) {
    const entries = (m.summary?.perLeaderboard ?? []).filter((e) => slugs.has(e.leaderboard));
    if (!entries.length) continue;
    const ps = entries.map((e) => e.percentile).sort((a, b) => a - b);
    const mid = Math.floor(ps.length / 2);
    const med = ps.length % 2 ? ps[mid]! : (ps[mid - 1]! + ps[mid]!) / 2;
    rows.push({
      model: m,
      medianPercentile: Math.round(med * 10) / 10,
      boards: Object.fromEntries(entries.map((e) => [e.leaderboard, { rank: e.rank, percentile: e.percentile }])),
    });
  }
  rows.sort((a, b) => b.medianPercentile - a.medianPercentile || Object.keys(b.boards).length - Object.keys(a.boards).length || a.model.name.localeCompare(b.model.name));
  return { boards: catBoards, rows };
}

export function sharedBoards(a: ModelListItem, b: ModelListItem): string[] {
  const bs = new Set((b.summary?.perLeaderboard ?? []).map((e) => e.leaderboard));
  return (a.summary?.perLeaderboard ?? []).map((e) => e.leaderboard).filter((x) => bs.has(x));
}

// Compare slugs ---------------------------------------------------------------

export function parsePair(pair: string): { a: string; b: string } | null {
  const i = pair.indexOf('-vs-');
  if (i <= 0) return null;
  const a = pair.slice(0, i);
  const b = pair.slice(i + 4);
  if (!a || !b || a === b || b.includes('-vs-')) return null;
  return { a, b };
}

/** Canonical compare slug: alphabetical `a-vs-b`. */
export function canonicalPair(a: string, b: string): string {
  return a < b ? `${a}-vs-${b}` : `${b}-vs-${a}`;
}

/** Pre-generated / sitemap pairs: top Chinese × top global non-Chinese, plus top Chinese pairs. */
export function popularPairs(list: ModelListItem[], nChina = 8, nGlobal = 8): string[] {
  const ranked = rankModels(list);
  const cn = ranked.filter(isChinese).slice(0, nChina);
  const gl = ranked.filter((m) => !isChinese(m)).slice(0, nGlobal);
  const out = new Set<string>();
  for (const c of cn) for (const g of gl) out.add(canonicalPair(c.slug, g.slug));
  const cnTop = cn.slice(0, 6);
  for (let i = 0; i < cnTop.length; i++) for (let j = i + 1; j < cnTop.length; j++) out.add(canonicalPair(cnTop[i]!.slug, cnTop[j]!.slug));
  return [...out].sort();
}
