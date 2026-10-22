import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Attribution } from '@/components/attribution';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/routing';
import { boardPath } from '@/lib/boards';
import { getBoards, getEnabledSources } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { localeParams, resolveLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const generateStaticParams = localeParams;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'leaderboards' });
  const [boards, sources] = await Promise.all([getBoards(), getEnabledSources()]);
  const names = sources.filter((s) => s.kind === 'scores').map((s) => s.name);
  return pageMetadata({
    locale,
    path: '/leaderboards',
    title: t('title'),
    description: t('description', { count: boards.length, sources: new Intl.ListFormat(locale).format(names) }),
  });
}

export default async function LeaderboardsPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  const [boards, sources] = await Promise.all([getBoards(), getEnabledSources()]);
  const bySource = sources.filter((s) => s.kind === 'scores');
  return (
    <div>
      <Breadcrumbs items={[{ name: t('common.nav.home'), href: `/${locale}` }, { name: t('common.nav.leaderboards'), href: `/${locale}/leaderboards` }]} />
      <PageHeader title={t('leaderboards.h1')} intro={t('leaderboards.intro')} />
      <div className="space-y-8">
        {bySource.map((src) => (
          <section key={src.slug}>
            <h2 className="mb-3 text-lg font-semibold">
              <Link href={`/${locale}/leaderboards/${src.slug}`} className="hover:underline">
                {src.name}
              </Link>
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.leaderboard')}</TableHead>
                  <TableHead>{t('table.category')}</TableHead>
                  <TableHead className="text-right">{t('table.coverage')}</TableHead>
                  <TableHead>{t('table.published')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boards
                  .filter((b) => b.sourceSlug === src.slug)
                  .map((b) => (
                    <TableRow key={b.slug}>
                      <TableCell>
                        <Link href={`/${locale}${boardPath(b)}`} className="font-medium hover:underline">
                          {b.name}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`categories.${b.category}` as 'categories.overall')}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.matchedCount}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(locale, b.latestPublishedAt)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </section>
        ))}
      </div>
      <Attribution locale={locale} sources={sources} used={bySource.map((s) => s.slug)} />
    </div>
  );
}
