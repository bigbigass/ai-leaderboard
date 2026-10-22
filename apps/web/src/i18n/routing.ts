import { defineRouting } from 'next-intl/routing';

export const LOCALES = ['en', 'zh', 'es', 'de', 'fr', 'ja', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  // hreflang is emitted in <head> by generateMetadata; avoid a second, divergent set in Link headers.
  alternateLinks: false,
});

export function isLocale(x: string): x is Locale {
  return (LOCALES as readonly string[]).includes(x);
}
