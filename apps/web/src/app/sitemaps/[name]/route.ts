import { loadSitemapPaths } from '@/lib/sitemap-data';
import { chunkSitemaps, urlsetXml } from '@/lib/sitemap';

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const chunk = chunkSitemaps(await loadSitemapPaths()).get(name.replace(/\.xml$/, ''));
  if (!chunk) return new Response('Not found', { status: 404 });
  return new Response(urlsetXml(chunk), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
