import type { Metadata } from 'next';
import type { ModelListItem } from '@ail/db/queries';
import { LOCALES, type Locale } from '@/i18n/routing';
import { sharedBoards } from './rankings';
import { abs, SITE_NAME } from './site';

/** hreflang map for a locale-less path ("" for home, "/models/x"): all 7 locales + x-default (en). */
export function languageAlternates(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(LOCALES.map((l) => [l, abs(`/${l}${path}`)])),
    'x-default': abs(`/en${path}`),
  };
}

export function pageMetadata(opts: { locale: Locale; path: string; title: string; description: string; noindex?: boolean }): Metadata {
  const url = abs(`/${opts.locale}${opts.path}`);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url, languages: languageAlternates(opts.path) },
    robots: opts.noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title: opts.title, description: opts.description, url, siteName: SITE_NAME, locale: opts.locale, type: 'website' },
    twitter: { card: 'summary', title: opts.title, description: opts.description },
  };
}

// Thin-content rules (SPEC §2): noindex,follow + excluded from the sitemap. -------------------

/** A model page is thin when it has no ranked data, or data from < 2 sources and no price. */
export function isModelIndexable(m: Pick<ModelListItem, 'summary' | 'price'>): boolean {
  const coverage = m.summary?.coverage ?? 0;
  if (coverage === 0) return false;
  const hasPrice = m.price != null && (m.price.prompt != null || m.price.completion != null);
  return (m.summary?.sourceCount ?? 0) >= 2 || hasPrice;
}

/** A compare page is thin when the two models share < 2 boards. */
export function isCompareIndexable(a: ModelListItem, b: ModelListItem): boolean {
  return sharedBoards(a, b).length >= 2;
}

/** Vendor/category hubs are thin when they list nothing. */
export const isHubIndexable = (rowCount: number) => rowCount > 0;
