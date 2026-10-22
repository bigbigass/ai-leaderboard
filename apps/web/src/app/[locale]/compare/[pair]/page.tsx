import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Attribution } from '@/components/attribution';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { DisagreementBadge } from '@/components/disagreement';
import { PageHeader } from '@/components/page-header';
import { Card, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/routing';
import { boardLookup } from '@/lib/boards';
import { getBoards, getEnabledSources, getModelList, type ModelListItem } from '@/lib/data';
import { fmtContext, fmtNum, fmtPrice, fmtScore } from '@/lib/format';
import { resolveLocale } from '@/lib/page';
import { canonicalPair, parsePair, popularPairs, sharedBoards } from '@/lib/rankings';
import { isCompareIndexable, pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';

export const revalidate = 86400;
export const dynamicParams = true;
type Props = { params: Promise<{ locale: string; pair: string }> };

export async function generateStaticParams() {
  return popularPairs(await getModelList()).map((pair) => ({ pair }));
}

async function load(pair: string): Promise<{ a: ModelListItem; b: ModelListItem } | null> {
  const ab = parsePair(pair);
  if (!ab) return null;
  const list = await getModelList();
  const a = list.find((m) => m.slug === ab.a);
  const b = list.find((m) => m.slug === ab.b);
  return a && b ? { a, b } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, pair } = (await params) as { locale: Locale; pair: string };
  const ab = await load(pair);
  if (!ab) return {};
  const t = await getTranslations({ locale, namespace: 'compare' });
  const [a, b] = [ab.a, ab.b].sort((x, y) => x.slug.localeCompare(y.slug)) as [ModelListItem, ModelListItem];
  return pageMetadata({
    locale,
    path: `/compare/${canonicalPair(a.slug, b.slug)}`,
    title: t('title', { a: a.name, b: b.name }),
    description: t('description', { a: a.name, b: b.name, count: sharedBoards(a, b).length }),
    noindex: !isCompareIndexable(a, b),
  });
}

export default async function ComparePage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { pair } = await params;
  const ab = await load(pair);
  if (!ab) notFound();
  const canonical = canonicalPair(ab.a.slug, ab.b.slug);
  // Middleware already 301s non-canonical order; this is a safety net.
  if (canonical !== pair) permanentRedirect(`/${locale}/compare/${canonical}`);
  const { a, b } = ab;
  const t = await getTranslations({ locale });
  const [boardsList, sources] = await Promise.all([getBoards(), getEnabledSources()]);
  const boards = boardLookup(boardsList);
  const shared = sharedBoards(a, b);
  const ea = (lb: string) => a.summary!.perLeaderboard.find((e) => e.leaderboard === lb)!;
  const eb = (lb: string) => b.summary!.perLeaderboard.find((e) => e.leaderboard === lb)!;
  const winsA = shared.filter((lb) => ea(lb).percentile > eb(lb).percentile).length;
  const winsB = shared.filter((lb) => eb(lb).percentile > ea(lb).percentile).length;
  const used = [...new Set(shared.map((lb) => ea(lb).source)), ...(a.price || b.price ? ['openrouter'] : [])];
  return (
    <div>
      <Breadcrumbs
        items={[
          { name: t('common.nav.home'), href: `/${locale}` },
          { name: t('common.nav.compare'), href: `/${locale}/compare` },
          { name: `${a.name} vs ${b.name}`, href: `/${locale}/compare/${canonical}` },
        ]}
      />
      <PageHeader title={t('compare.h1', { a: a.name, b: b.name })} intro={t('compare.sharedCount', { count: shared.length })}>
        {shared.length > 0 && (
          <p className="text-sm">
            {winsA === winsB ? t('compare.tie') : t('compare.winner', { name: winsA > winsB ? a.name : b.name, wins: Math.max(winsA, winsB), total: shared.length })}
          </p>
        )}
        {!isCompareIndexable(a, b) && <p className="text-xs text-muted-foreground">{t('common.noindexNote')}</p>}
      </PageHeader>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">{t('compare.shared')}</h2>
        {shared.length === 0 ? (
          <p className="text-muted-foreground">{t('compare.noShared')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.leaderboard')}</TableHead>
                <TableHead className="text-right">{a.name}</TableHead>
                <TableHead className="text-right">{b.name}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shared.map((lb) => {
                const x = ea(lb);
                const y = eb(lb);
                const st = boards.get(lb)?.scoreType ?? 'elo';
                const cell = (e: typeof x, win: boolean) => (
                  <TableCell className={cn('text-right tabular-nums', win && 'font-semibold text-good')}>
                    {e.rank != null ? `#${e.rank}` : '—'} · {fmtScore(locale, e.score, st)}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t('table.percentile')} {fmtNum(locale, e.percentile, 1)}
                    </span>
                  </TableCell>
                );
                return (
                  <TableRow key={lb}>
                    <TableCell>
                      {boards.path(lb) ? (
                        <Link href={`/${locale}${boards.path(lb)}`} className="hover:underline">
                          {boards.name(lb)}
                        </Link>
                      ) : (
                        lb
                      )}
                    </TableCell>
                    {cell(x, x.percentile > y.percentile)}
                    {cell(y, y.percentile > x.percentile)}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {[a, b].map((m) => (
          <Card key={m.slug}>
            <CardTitle>
              <Link href={`/${locale}/models/${m.slug}`} className="hover:underline">
                {m.name}
              </Link>
            </CardTitle>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('table.vendor')}</dt>
              <dd>{m.vendorName}</dd>
              <dt className="text-muted-foreground">{t('table.median')}</dt>
              <dd className="tabular-nums">{fmtNum(locale, m.summary?.medianPercentile, 1)}</dd>
              <dt className="text-muted-foreground">{t('table.price')}</dt>
              <dd className="tabular-nums">{m.price ? `${fmtPrice(locale, m.price.prompt)} / ${fmtPrice(locale, m.price.completion)}` : '—'}</dd>
              <dt className="text-muted-foreground">{t('table.context')}</dt>
              <dd className="tabular-nums">{fmtContext(locale, m.price?.contextLength)}</dd>
              <dt className="text-muted-foreground">{t('table.disagreement')}</dt>
              <dd>
                <DisagreementBadge locale={locale} flag={m.summary?.disagreementFlag} score={m.summary?.disagreementScore} />
              </dd>
            </dl>
          </Card>
        ))}
      </div>
      <Attribution locale={locale} sources={sources} used={used} />
    </div>
  );
}
