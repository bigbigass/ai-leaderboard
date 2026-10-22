import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/routing';
import { JsonLdScript } from '@/components/json-ld';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { websiteLd } from '@/lib/jsonld';
import { localeParams, resolveLocale } from '@/lib/page';
import { abs, siteUrl } from '@/lib/site';

export const generateStaticParams = localeParams;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'common' });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t('siteName'), template: `%s | ${t('siteName')}` },
    description: t('tagline'),
    applicationName: t('siteName'),
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <html lang={locale}>
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
          {t('skipToContent')}
        </a>
        <JsonLdScript data={websiteLd(abs(`/${locale}`), locale, t('tagline'))} />
        <SiteHeader locale={locale} />
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          {children}
        </main>
        <SiteFooter locale={locale} />
        <Analytics />
      </body>
    </html>
  );
}
