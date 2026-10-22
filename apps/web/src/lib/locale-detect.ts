import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n/routing';

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|lighthouse|headless/i;

export const isBot = (ua: string | null | undefined) => !!ua && BOT_RE.test(ua);

/** Best supported locale from an Accept-Language header (q-weighted); en when nothing matches. */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const prefs = acceptLanguage
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { tag: (tag ?? '').toLowerCase(), q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .filter((p) => p.tag && p.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const p of prefs) {
    const base = p.tag.split('-')[0] as Locale;
    if ((LOCALES as readonly string[]).includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}
