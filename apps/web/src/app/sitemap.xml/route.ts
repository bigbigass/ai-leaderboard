import { loadSitemapPaths } from '@/lib/sitemap-data';
import { chunkSitemaps, SITEMAP_INDEX_THRESHOLD, sitemapIndexXml, urlCount, urlsetXml } from '@/lib/sitemap';

export const revalidate = 86400;

/** Single urlset up to 5k URLs; above that a sitemap index pointing at /sitemaps/<group>-<n>.xml. */
export async function GET() {
  const paths = await loadSitemapPaths();
  const latest = paths.map((p) => p.lastModified ?? '').sort().at(-1) || null;
  const body = urlCount(paths) > SITEMAP_INDEX_THRESHOLD ? sitemapIndexXml([...chunkSitemaps(paths).keys()], latest) : urlsetXml(paths);
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
