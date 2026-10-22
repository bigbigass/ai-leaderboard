#!/usr/bin/env node
/**
 * Smoke test against a running site (default http://localhost:3000, override with BASE_URL).
 *   pnpm build && pnpm start &   then   pnpm smoke
 * Checks: every page type returns 200 in all 7 locales, hreflang (7 + x-default) and canonical are
 * present, thin pages carry noindex, JSON-LD parses with an @type, the sitemap only lists
 * indexable 200 pages, "/" redirects, non-canonical compare slugs 301, /api/revalidate rejects a bad secret.
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const LOCALES = ['en', 'zh', 'es', 'de', 'fr', 'ja', 'pt'];
let failures = 0;
let checks = 0;

function fail(msg) {
  failures++;
  console.error(`✗ ${msg}`);
}
function ok(cond, msg) {
  checks++;
  if (!cond) fail(msg);
  return cond;
}

async function get(path, init = {}) {
  const res = await fetch(BASE + path, { redirect: 'manual', ...init });
  const body = res.status === 200 ? await res.text() : '';
  return { res, body };
}

function inspect(html) {
  const hreflangs = [...html.matchAll(/<link[^>]+rel="alternate"[^>]+hrefLang="([^"]+)"[^>]*>/gi)].map((m) => m[1]);
  const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(html)?.[1] ?? null;
  const robots = /<meta[^>]+name="robots"[^>]+content="([^"]+)"/i.exec(html)?.[1] ?? '';
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return { hreflangs, canonical, noindex: /noindex/.test(robots), ld };
}

async function checkPage(path, { noindex = false } = {}) {
  for (const l of LOCALES) {
    const url = `/${l}${path}`;
    const { res, body } = await get(url);
    if (!ok(res.status === 200, `${url} → ${res.status}`)) continue;
    const p = inspect(body);
    ok(p.hreflangs.length === 8 && p.hreflangs.includes('x-default') && LOCALES.every((x) => p.hreflangs.includes(x)), `${url} hreflang: ${p.hreflangs.join(',')}`);
    ok(p.canonical?.endsWith(url), `${url} canonical ${p.canonical}`);
    ok(p.noindex === noindex, `${url} noindex expected ${noindex}, got ${p.noindex}`);
    ok(new RegExp(`<html lang="${l}"`).test(body), `${url} html lang`);
    for (const raw of p.ld) {
      try {
        const data = JSON.parse(raw);
        for (const d of Array.isArray(data) ? data : [data]) ok(d['@context'] === 'https://schema.org' && typeof d['@type'] === 'string', `${url} JSON-LD @type`);
      } catch {
        fail(`${url} JSON-LD does not parse`);
      }
    }
    ok(p.ld.length >= (path === '' ? 1 : 2), `${url} has WebSite (+ BreadcrumbList) JSON-LD (${p.ld.length})`);
  }
}

async function main() {
  // Discover concrete slugs from the sitemap so the script works against any data set.
  const sm = await get('/sitemap.xml');
  ok(sm.res.status === 200, `/sitemap.xml → ${sm.res.status}`);
  let locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (sm.body.includes('<sitemapindex')) {
    const all = [];
    for (const child of locs) {
      const r = await fetch(child.replace(/^https?:\/\/[^/]+/, BASE));
      all.push(...[...(await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    }
    locs = all;
  }
  const paths = [...new Set(locs.map((u) => new URL(u).pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '')))];
  const pick = (re) => paths.find((p) => re.test(p));
  console.log(`sitemap: ${locs.length} URLs, ${paths.length} distinct pages`);

  const pageTypes = {
    home: '',
    models: '/models',
    model: pick(/^\/models\/[^/]+$/),
    leaderboards: '/leaderboards',
    source: pick(/^\/leaderboards\/[^/]+$/),
    board: pick(/^\/leaderboards\/[^/]+\/[^/]+$/),
    categories: '/categories',
    category: pick(/^\/categories\/[^/]+$/),
    compareIndex: '/compare',
    compare: pick(/^\/compare\/[^/]+$/),
    vendors: '/vendors',
    vendor: pick(/^\/vendors\/[^/]+$/),
    chinese: '/chinese-models',
    sources: '/sources',
    methodology: '/methodology',
  };
  for (const [type, path] of Object.entries(pageTypes)) {
    if (!ok(path != null, `no ${type} page found in sitemap`)) continue;
    await checkPage(path);
  }

  // Every sitemap URL: 200 and indexable.
  for (const u of locs) {
    const { res, body } = await get(new URL(u).pathname);
    if (ok(res.status === 200, `sitemap URL ${u} → ${res.status}`)) ok(!inspect(body).noindex, `sitemap URL ${u} is noindex`);
  }

  // Thin pages: noindex and absent from the sitemap.
  const thin = [];
  const board = pageTypes.board;
  if (board) {
    const { body } = await get(`/en${board}`);
    const date = [...body.matchAll(new RegExp(`href="/en${board}/(\\d{4}-\\d{2}-\\d{2})"`, 'g'))].map((m) => m[1])[0];
    if (ok(date, 'board page links a history snapshot')) thin.push(`${board}/${date}`);
  }
  const models = await get('/en/models');
  const modelSlugs = [...new Set([...models.body.matchAll(/href="\/en\/models\/([^"]+)"/g)].map((m) => m[1]))];
  const thinModel = modelSlugs.find((s) => !paths.includes(`/models/${s}`));
  if (thinModel) thin.push(`/models/${thinModel}`);
  const cats = await get('/en/categories');
  const catSlugs = [...new Set([...cats.body.matchAll(/href="\/en\/categories\/([^"]+)"/g)].map((m) => m[1]))];
  const emptyCat = catSlugs.find((s) => !paths.includes(`/categories/${s}`));
  if (emptyCat) thin.push(`/categories/${emptyCat}`);
  console.log(`thin pages checked: ${thin.join(', ') || '(none)'}`);
  ok(thin.length >= 2, 'found thin pages to verify');
  for (const p of thin) {
    ok(!paths.includes(p), `thin page ${p} is in sitemap`);
    await checkPage(p, { noindex: true });
  }

  // Redirects and API.
  const root = await get('/', { headers: { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' } });
  ok([307, 308].includes(root.res.status) && root.res.headers.get('location')?.endsWith('/zh'), `/ (zh) → ${root.res.status} ${root.res.headers.get('location')}`);
  const rootBot = await get('/', { headers: { 'accept-language': 'zh-CN', 'user-agent': 'Googlebot/2.1' } });
  ok(rootBot.res.headers.get('location')?.endsWith('/en'), `/ (bot) → ${rootBot.res.headers.get('location')}`);
  if (pageTypes.compare) {
    const [a, b] = pageTypes.compare.slice('/compare/'.length).split('-vs-');
    const rev = await get(`/en/compare/${b}-vs-${a}`);
    ok(rev.res.status === 301 && rev.res.headers.get('location')?.endsWith(`/en${pageTypes.compare}`), `reversed compare → ${rev.res.status} ${rev.res.headers.get('location')}`);
  }
  ok((await get('/en/models/does-not-exist')).res.status === 404, 'unknown model → 404');
  const bad = await fetch(`${BASE}/api/revalidate`, { method: 'POST', headers: { 'x-revalidate-secret': 'wrong' } });
  ok(bad.status === 401, `/api/revalidate bad secret → ${bad.status}`);
  if (process.env.REVALIDATE_SECRET) {
    const good = await fetch(`${BASE}/api/revalidate`, {
      method: 'POST',
      headers: { 'x-revalidate-secret': process.env.REVALIDATE_SECRET, 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['db'], paths: ['/'] }),
    });
    ok(good.status === 200, `/api/revalidate good secret → ${good.status}`);
  }
  const robots = await get('/robots.txt');
  ok(robots.res.status === 200 && /Sitemap: .*\/sitemap\.xml/.test(robots.body), 'robots.txt lists sitemap');

  console.log(`${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
