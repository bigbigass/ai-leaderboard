import type { BoardInfo, ModelListItem, VendorInfo } from '@ail/db/queries';
import { boardPath } from './boards';
import { CATEGORIES, categoryView, parsePair, popularPairs, rankModels } from './rankings';
import { isCompareIndexable, isHubIndexable, isModelIndexable } from './seo';
import type { SitemapPath } from './sitemap';

/** Every indexable page (locale-less). noindex pages — thin models/compares, empty hubs, history snapshots — are excluded. */
export function buildSitemapPaths(list: ModelListItem[], boards: BoardInfo[], vendors: VendorInfo[]): SitemapPath[] {
  const latest = boards.map((b) => b.latestPublishedAt).sort().at(-1) ?? null;
  const out: SitemapPath[] = [];
  const staticPaths = ['', '/models', '/leaderboards', '/categories', '/compare', '/vendors', '/sources', '/methodology'];
  if (list.some((m) => m.country === 'CN')) staticPaths.push('/chinese-models');
  for (const p of staticPaths) out.push({ path: p, lastModified: latest, group: 'static' });

  for (const src of [...new Set(boards.map((b) => b.sourceSlug))]) {
    const mine = boards.filter((b) => b.sourceSlug === src);
    out.push({ path: `/leaderboards/${src}`, lastModified: mine.map((b) => b.latestPublishedAt).sort().at(-1) ?? null, group: 'leaderboards' });
  }
  for (const b of boards) if (b.matchedCount > 0) out.push({ path: boardPath(b), lastModified: b.latestPublishedAt, group: 'leaderboards' });

  for (const m of list) {
    if (!isModelIndexable(m)) continue;
    const lm = m.summary?.perLeaderboard.map((e) => e.publishedAt).sort().at(-1) ?? null;
    out.push({ path: `/models/${m.slug}`, lastModified: lm, group: 'models' });
  }
  for (const c of CATEGORIES) {
    if (isHubIndexable(categoryView(list, boards, c).rows.length)) out.push({ path: `/categories/${c}`, lastModified: latest, group: 'categories' });
  }
  for (const v of vendors) {
    if (isHubIndexable(rankModels(list.filter((m) => m.vendorSlug === v.slug)).length)) out.push({ path: `/vendors/${v.slug}`, lastModified: latest, group: 'vendors' });
  }
  const bySlug = new Map(list.map((m) => [m.slug, m]));
  for (const pair of popularPairs(list)) {
    const ab = parsePair(pair)!;
    const a = bySlug.get(ab.a)!;
    const b = bySlug.get(ab.b)!;
    if (isCompareIndexable(a, b)) out.push({ path: `/compare/${pair}`, lastModified: latest, group: 'compare' });
  }
  return out;
}
