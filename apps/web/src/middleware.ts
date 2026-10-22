import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { isBot, pickLocale } from './lib/locale-detect';
import { canonicalPair, parsePair } from './lib/rankings';

const intl = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // "/" → best locale from Accept-Language; crawlers always land on /en (stable, x-default).
  if (pathname === '/') {
    const locale = isBot(req.headers.get('user-agent')) ? 'en' : pickLocale(req.headers.get('accept-language'));
    const res = NextResponse.redirect(new URL(`/${locale}`, req.url), 307);
    res.headers.set('Vary', 'Accept-Language, User-Agent');
    return res;
  }

  // Compare slugs are canonical in alphabetical order: /compare/b-vs-a → 301 /compare/a-vs-b.
  const m = /^\/([a-z]{2})\/compare\/([^/]+)\/?$/.exec(pathname);
  if (m) {
    const ab = parsePair(m[2]!);
    if (ab) {
      const canonical = canonicalPair(ab.a, ab.b);
      if (canonical !== m[2]) return NextResponse.redirect(new URL(`/${m[1]}/compare/${canonical}`, req.url), 301);
    }
  }

  return intl(req);
}

export const config = {
  // Everything except API routes, Next internals, sitemap/robots and files with an extension.
  matcher: ['/((?!api|_next|_vercel|sitemap|sitemaps|robots\\.txt|.*\\..*).*)'],
};
