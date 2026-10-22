import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isLocale, LOCALES, type Locale } from '@/i18n/routing';

/** Validate the [locale] param and enable static rendering for it. */
export async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return locale;
}

export const localeParams = () => LOCALES.map((locale) => ({ locale }));
