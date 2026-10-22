import { describe, expect, it } from 'vitest';
import { chunkSitemaps, SITEMAP_INDEX_THRESHOLD, sitemapIndexXml, urlCount, urlsetXml, type SitemapPath } from '@/lib/sitemap';
import { buildSitemapPaths } from '@/lib/sitemap-paths';
import { board, entry, model } from './fixtures';

process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

describe('sitemap XML', () => {
  it('emits one <url> per locale with hreflang alternates incl. x-default', () => {
    const xml = urlsetXml([{ path: '/models/a', lastModified: '2025-09-30', group: 'models' }]);
    expect(xml.match(/<url>/g)).toHaveLength(7);
    expect(xml).toContain('<loc>https://example.com/zh/models/a</loc>');
    expect(xml).toContain('hreflang="x-default" href="https://example.com/en/models/a"');
    expect(xml).toContain('<lastmod>2025-09-30</lastmod>');
  });

  it('switches to a sitemap index above the threshold and chunks by group', () => {
    const many: SitemapPath[] = Array.from({ length: Math.ceil(SITEMAP_INDEX_THRESHOLD / 7) + 1 }, (_, i) => ({ path: `/models/m${i}`, group: 'models' }));
    expect(urlCount(many)).toBeGreaterThan(SITEMAP_INDEX_THRESHOLD);
    const chunks = chunkSitemaps([...many, { path: '', group: 'static' }]);
    expect([...chunks.keys()]).toEqual(['models-0', 'static-0']);
    const idx = sitemapIndexXml([...chunks.keys()]);
    expect(idx).toContain('<sitemapindex');
    expect(idx).toContain('https://example.com/sitemaps/models-0.xml');
  });
});

describe('buildSitemapPaths', () => {
  const boards = [board('lmarena-text-overall'), board('epoch-gpqa', 'knowledge')];
  const strong = model('strong', { country: 'CN', vendorSlug: 'cnv', boards: [entry('lmarena-text-overall', 90), entry('epoch-gpqa', 80, { category: 'knowledge' })] });
  const thin = model('thin', { vendorSlug: 'v2', boards: [entry('lmarena-text-overall', 40)] });
  const empty = model('empty', { vendorSlug: 'v3' });
  const paths = buildSitemapPaths([strong, thin, empty], boards, [
    { slug: 'cnv', name: 'CN', country: 'CN', website: null },
    { slug: 'v2', name: 'V2', country: 'US', website: null },
    { slug: 'v3', name: 'V3', country: 'US', website: null },
  ]).map((p) => p.path);

  it('includes indexable pages', () => {
    expect(paths).toEqual(expect.arrayContaining(['', '/models', '/chinese-models', '/models/strong', '/leaderboards/lmarena', '/leaderboards/lmarena/text-overall', '/categories/overall', '/categories/knowledge', '/vendors/cnv', '/vendors/v2']));
  });

  it('excludes thin pages', () => {
    expect(paths).not.toContain('/models/thin'); // 1 source, no price
    expect(paths).not.toContain('/models/empty');
    expect(paths).not.toContain('/vendors/v3'); // no ranked models
    expect(paths).not.toContain('/categories/vision'); // empty category
    expect(paths.some((p) => /\/\d{4}-\d{2}-\d{2}$/.test(p))).toBe(false); // history snapshots
    expect(paths).not.toContain('/compare/strong-vs-thin'); // only 1 shared board
  });
});
