import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Attribution } from '@/components/attribution';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/i18n/routing';
import { boardPath } from '@/lib/boards';
import { getBoards, getEnabledSources, getModelList } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { resolveLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const dynamicParams = true;
type Props = { params: Promise<{ locale: string; source: string }> };

export async function generateStaticParams() {
  return (await getEnabledSources()).filter((s) => s.kind === 'scores').map((s) => ({ source: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, source } = (await params) as { locale: Locale; source: string };
  const src = (await getEnabledSources()).find((s) => s.slug === source && s.kind === 'scores');
  if (!src) return {};
  const t = await getTranslations({ locale, namespace: 'leaderboards' });
  const count = (await getBoards()).filter((b) => b.sourceSlug === source).length;
  return pageMetadata({
    locale,
    path: `/leaderboards/${source}`,
    title: t('sourceTitle', { source: src.name }),
    description: t('sourceDescription', { source: src.name, count }),
    noindex: count === 0,
  });
}

export default async function SourcePage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { source } = await params;
  const [sources, boards, list] = await Promise.all([getEnabledSources(), getBoards(), getModelList()]);
  const src = sources.find((s) => s.slug === source && s.kind === 'scores');
  if (!src) notFound();
  const t = await getTranslations({ locale });
  const mine = boards.filter((b) => b.sourceSlug === source);
  const topFor = (slug: string) =>
    list
      .map((m) => ({ m, e: m.summary?.perLeaderboard.find((x) => x.leaderboard === slug) }))
      .filter((x): x is { m: (typeof list)[number]; e: NonNullable<typeof x.e> } => x.e != null)
      .sort((a, b) => (a.e.rank ?? 1e9) - (b.e.rank ?? 1e9))
      .slice(0, 5);
  return (
    <div>
      <Breadcrumbs
        items={[
          { name: t('common.nav.home'), href: `/${locale}` },
          { name: t('common.nav.leaderboards'), href: `/${locale}/leaderboards` },
          { name: src.name, href: `/${locale}/leaderboards/${source}` },
        ]}
      />
      <PageHeader title={t('leaderboards.sourceH1', { source: src.name })} intro={src.attribution} />
      <div className="grid gap-4 md:grid-cols-2">
        {mine.map((b) => (
          <Card key={b.slug}>
            <CardTitle>
              <Link href={`/${locale}${boardPath(b)}`} className="hover:underline">
                {b.name}
              </Link>
            </CardTitle>
            <CardDescription>
              {t(`categories.${b.category}` as 'categories.overall')} · {t('leaderboards.publishedOn', { date: fmtDate(locale, b.latestPublishedAt) })}
            </CardDescription>
            <ol className="mt-3 space-y-1 text-sm">
              {topFor(b.slug).map(({ m, e }) => (
                <li key={m.slug} className="flex gap-2">
                  <span className="w-6 text-right text-muted-foreground tabular-nums">{e.rank}</span>
                  <Link href={`/${locale}/models/${m.slug}`} className="hover:underline">
                    {m.name}
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
      <Attribution locale={locale} sources={sources} used={[source]} />
    </div>
  );
}
