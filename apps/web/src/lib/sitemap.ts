import { LOCALES } from '@/i18n/routing';
import { abs } from './site';

export interface SitemapPath {
  /** Locale-less path ("" for home). Expanded to every locale with hreflang alternates. */
  path: string;
  lastModified?: string | null;
  group: 'static' | 'models' | 'leaderboards' | 'categories' | 'vendors' | 'compare';
}

/** Above this many URLs the sitemap becomes an index of per-group files (SPEC §2). */
export const SITEMAP_INDEX_THRESHOLD = 5000;
const MAX_PER_FILE = 45000;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function urlCount(paths: SitemapPath[]): number {
  return paths.length * LOCALES.length;
}

export function urlsetXml(paths: SitemapPath[]): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const p of paths) {
    const alts = [
      ...LOCALES.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(abs(`/${l}${p.path}`))}"/>`),
      `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(abs(`/en${p.path}`))}"/>`,
    ].join('');
    for (const l of LOCALES) {
      out.push(
        `<url><loc>${esc(abs(`/${l}${p.path}`))}</loc>${p.lastModified ? `<lastmod>${esc(p.lastModified.slice(0, 10))}</lastmod>` : ''}${alts}</url>`,
      );
    }
  }
  out.push('</urlset>');
  return out.join('\n');
}

/** Split into named chunk files: "<group>-<n>". */
export function chunkSitemaps(paths: SitemapPath[]): Map<string, SitemapPath[]> {
  const byGroup = new Map<string, SitemapPath[]>();
  for (const p of paths) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
  const out = new Map<string, SitemapPath[]>();
  const perFile = Math.floor(MAX_PER_FILE / LOCALES.length);
  for (const [group, list] of byGroup) {
    for (let i = 0, n = 0; i < list.length; i += perFile, n++) out.set(`${group}-${n}`, list.slice(i, i + perFile));
  }
  return out;
}

export function sitemapIndexXml(names: string[], lastModified?: string | null): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...names.map((n) => `<sitemap><loc>${esc(abs(`/sitemaps/${n}.xml`))}</loc>${lastModified ? `<lastmod>${esc(lastModified.slice(0, 10))}</lastmod>` : ''}</sitemap>`),
    '</sitemapindex>',
  ].join('\n');
}
