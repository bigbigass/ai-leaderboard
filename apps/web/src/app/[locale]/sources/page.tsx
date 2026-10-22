import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/i18n/routing';
import { getEnabledSources } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { localeParams, resolveLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const generateStaticParams = localeParams;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'sources' });
  return pageMetadata({ locale, path: '/sources', title: t('title'), description: t('description') });
}

export default async function SourcesPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  // Only enabled sources are ever listed (disabled ones must not appear anywhere in the UI).
  const sources = await getEnabledSources();
  return (
    <div>
      <Breadcrumbs items={[{ name: t('common.nav.home'), href: `/${locale}` }, { name: t('common.nav.sources'), href: `/${locale}/sources` }]} />
      <PageHeader title={t('sources.h1')} intro={t('sources.intro')} />
      <div className="space-y-4">
        {sources.map((s) => (
          <Card key={s.slug} id={s.slug}>
            <CardTitle>{s.name}</CardTitle>
            <CardDescription>{s.kind === 'scores' ? t('sources.kindScores') : t('sources.kindMetadata')}</CardDescription>
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted-foreground">{t('sources.license')}</dt>
              <dd>
                {s.licenseUrl ? (
                  <a href={s.licenseUrl} className="underline" rel="license noopener" target="_blank">
                    {s.license}
                  </a>
                ) : (
                  s.license
                )}
              </dd>
              <dt className="text-muted-foreground">{t('sources.attribution')}</dt>
              <dd>{s.attribution}</dd>
              <dt className="text-muted-foreground">{t('sources.homepage')}</dt>
              <dd>
                {s.homepage && (
                  <a href={s.homepage} className="underline" rel="noopener" target="_blank">
                    {s.homepage}
                  </a>
                )}
              </dd>
              {s.kind === 'scores' && (
                <>
                  <dt className="text-muted-foreground">{t('table.boards')}</dt>
                  <dd>
                    <Link href={`/${locale}/leaderboards/${s.slug}`} className="underline">
                      {t('sources.boards', { count: s.boardCount })}
                    </Link>
                  </dd>
                  <dt className="text-muted-foreground">{t('sources.latestPublished')}</dt>
                  <dd>{fmtDate(locale, s.lastPublishedAt)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('sources.lastUpdate')}</dt>
              <dd>{fmtDate(locale, s.lastCapturedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            </dl>
            {s.slug === 'epoch' && <p className="mt-3 text-xs text-muted-foreground">{t('sources.epochNote')}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
