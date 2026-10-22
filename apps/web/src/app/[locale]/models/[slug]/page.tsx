import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Attribution } from '@/components/attribution';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { DisagreementBadge, DisagreementSentence } from '@/components/disagreement';
import { JsonLdScript } from '@/components/json-ld';
import { TrendChart, type TrendSeries } from '@/components/trend-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/routing';
import { boardLookup } from '@/lib/boards';
import { getBoards, getEnabledSources, getModelDetail, getModelList } from '@/lib/data';
import { fmtContext, fmtDate, fmtMonth, fmtNum, fmtPrice, fmtScore, variantKeys } from '@/lib/format';
import { modelLd } from '@/lib/jsonld';
import { resolveLocale } from '@/lib/page';
import { canonicalPair, rankModels, sharedBoards } from '@/lib/rankings';
import { isModelIndexable, pageMetadata } from '@/lib/seo';
import { abs, DISAGREEMENT_THRESHOLD } from '@/lib/site';

export const revalidate = 86400;
export const dynamicParams = true;

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Pre-generate the top 300 ranked models; the rest render on first request. */
export async function generateStaticParams() {
  return rankModels(await getModelList())
    .slice(0, 300)
    .map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const detail = await getModelDetail(slug);
  if (!detail) return {};
  const t = await getTranslations({ locale, namespace: 'model' });
  const boards = boardLookup(await getBoards());
  const m = detail.model;
  const s = m.summary;
  const path = `/models/${slug}`;
  const noindex = !isModelIndexable(m);
  if (!s || s.coverage === 0) {
    return pageMetadata({ locale, path, title: t('titleNoData', { name: m.name }), description: t('descriptionNoData', { name: m.name, vendor: m.vendorName }), noindex });
  }
  const latest = s.perLeaderboard.map((e) => e.publishedAt).sort().at(-1)!;
  const best = [...s.perLeaderboard].filter((e) => e.rank != null).sort((a, b) => b.percentile - a.percentile)[0];
  return pageMetadata({
    locale,
    path,
    noindex,
    title: t('title', { name: m.name, count: s.coverage, month: fmtMonth(locale, latest) }),
    description: t('description', {
      name: m.name,
      vendor: m.vendorName,
      count: s.coverage,
      median: fmtNum(locale, s.medianPercentile, 0),
      best: best ? t('descriptionBest', { rank: best.rank!, board: boards.name(best.leaderboard) }) : '',
      price: m.price?.prompt != null ? t('descriptionPrice', { prompt: fmtNum(locale, m.price.prompt, 2), completion: fmtNum(locale, m.price.completion, 2) }) : '',
    }).trim(),
  });
}

export default async function ModelPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  const [detail, boardsList, sources, list] = await Promise.all([getModelDetail(slug), getBoards(), getEnabledSources(), getModelList()]);
  if (!detail) notFound();
  const t = await getTranslations({ locale });
  const boards = boardLookup(boardsList);
  const m = detail.model;
  const s = m.summary;
  const per = s?.perLeaderboard ?? [];
  const indexable = isModelIndexable(m);
  const best = [...per].filter((e) => e.rank != null).sort((a, b) => b.percentile - a.percentile)[0];

  const series: TrendSeries[] = [...new Set(detail.history.map((h) => h.leaderboard))]
    .map((lb) => ({
      key: lb,
      label: boards.name(lb),
      points: detail.history
        .filter((h) => h.leaderboard === lb && h.percentile != null)
        .map((h) => ({ date: h.publishedAt, value: h.percentile!, rank: h.rank, batch: h.batchKey })),
    }))
    .filter((x) => x.points.length > 1)
    .sort((a, b) => b.points.length - a.points.length || a.label.localeCompare(b.label));

  const compareCandidates = list
    .filter((o) => o.slug !== m.slug && sharedBoards(m, o).length >= 2)
    .sort((a, b) => (b.summary?.medianPercentile ?? 0) - (a.summary?.medianPercentile ?? 0))
    .slice(0, 6);
  const usedSources = [...new Set(per.map((e) => e.source)), ...(m.price ? ['openrouter'] : [])];
  const vk = (v: string) => variantKeys(v).map((k) => t(`variants.${k}` as 'variants.default')).join(', ');

  return (
    <article>
      <Breadcrumbs
        items={[
          { name: t('common.nav.home'), href: `/${locale}` },
          { name: t('common.nav.models'), href: `/${locale}/models` },
          { name: m.name, href: `/${locale}/models/${m.slug}` },
        ]}
      />
      <JsonLdScript
        data={modelLd({
          name: m.name,
          url: abs(`/${locale}/models/${m.slug}`),
          vendorName: m.vendorName,
          vendorUrl: detail.vendorWebsite,
          description: s?.coverage
            ? t('model.summary', { name: m.name, count: s.coverage, sources: s.sourceCount, median: fmtNum(locale, s.medianPercentile, 0) })
            : t('model.summaryNoData', { name: m.name }),
          releasedAt: m.releasedAt,
          openWeights: m.openWeights,
          license: m.license,
          pricePromptPerM: m.price?.prompt ?? null,
        })}
      />
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{m.name}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/${locale}/vendors/${m.vendorSlug}`} className="underline">
            {t('model.byVendor', { vendor: m.vendorName })}
          </Link>
          {m.country === 'CN' && <Badge variant="accent">{t('common.china')}</Badge>}
          {m.openWeights != null && <Badge variant="outline">{m.openWeights ? t('common.openWeights') : t('common.proprietary')}</Badge>}
          {s && <DisagreementBadge locale={locale} flag={s.disagreementFlag} score={s.disagreementScore} />}
        </p>
        <p className="max-w-3xl">
          {s?.coverage
            ? t('model.summary', { name: m.name, count: s.coverage, sources: s.sourceCount, median: fmtNum(locale, s.medianPercentile, 0) })
            : t('model.summaryNoData', { name: m.name })}{' '}
          {best ? t('model.summaryBest', { rank: best.rank!, board: boards.name(best.leaderboard) }) : null}
        </p>
        {s?.disagreementPair && (
          <p className="max-w-3xl rounded-md bg-warn-bg p-3 text-sm text-warn">
            <DisagreementSentence locale={locale} pair={s.disagreementPair} boardName={boards.name} />{' '}
            {t('disagreement.what', { threshold: DISAGREEMENT_THRESHOLD })}
          </p>
        )}
        {!indexable && <p className="text-xs text-muted-foreground">{t('common.noindexNote')}</p>}
      </header>

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t('model.ranksHeading')}</h2>
          {per.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.leaderboard')}</TableHead>
                  <TableHead>{t('table.category')}</TableHead>
                  <TableHead className="text-right">{t('table.rank')}</TableHead>
                  <TableHead className="text-right">{t('table.score')}</TableHead>
                  <TableHead className="text-right">{t('table.percentile')}</TableHead>
                  <TableHead>{t('table.variant')}</TableHead>
                  <TableHead>{t('table.rawName')}</TableHead>
                  <TableHead>{t('table.published')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {per.map((e) => {
                  const b = boards.get(e.leaderboard);
                  const path = boards.path(e.leaderboard);
                  return (
                    <TableRow key={e.leaderboard}>
                      <TableCell>{path ? <Link href={`/${locale}${path}`} className="hover:underline">{boards.name(e.leaderboard)}</Link> : e.leaderboard}</TableCell>
                      <TableCell>{t(`categories.${e.category}` as 'categories.overall')}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.rank != null ? `#${e.rank}` : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtScore(locale, e.score, b?.scoreType ?? 'elo')}
                        {e.scoreLower != null && e.scoreUpper != null && e.score != null && b?.scoreType === 'elo' ? (
                          <span className="text-xs text-muted-foreground"> ±{fmtNum(locale, (e.scoreUpper - e.scoreLower) / 2)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(locale, e.percentile, 1)}</TableCell>
                      <TableCell className="text-xs">{vk(e.variant)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.rawName}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(locale, e.publishedAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">{t('common.noData')}</p>
          )}
          {detail.externalRows.map((r) => (
            <p key={r.leaderboard} className="mt-2 text-xs text-muted-foreground">
              {boards.name(r.leaderboard)}: {t('model.external', { source: r.originalSource ?? '—' })}{' '}
              {r.sourceLink && (
                <a href={r.sourceLink} className="underline" rel="noopener" target="_blank">
                  {r.sourceLink}
                </a>
              )}
            </p>
          ))}
        </section>

        {series.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold">{t('model.trendHeading')}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{t('model.trendIntro')}</p>
            <TrendChart
              series={series}
              ariaLabel={`${t('model.trendHeading')}: ${m.name}`}
              formatDate={(d) => fmtDate(locale, d, { month: 'short', day: 'numeric' })}
              batchLabel={t('model.trendIntro')}
            />
          </section>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardTitle>{t('model.priceHeading')}</CardTitle>
            {m.price ? (
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t('table.price')}</dt>
                <dd className="tabular-nums">
                  {fmtPrice(locale, m.price.prompt)} / {fmtPrice(locale, m.price.completion)}
                </dd>
                <dt className="text-muted-foreground">{t('table.context')}</dt>
                <dd className="tabular-nums">{fmtContext(locale, m.price.contextLength)}</dd>
                <dt className="text-muted-foreground">OpenRouter</dt>
                <dd className="font-mono text-xs">{m.price.openrouterId}</dd>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t('model.noPrice')}</p>
            )}
            <CardDescription>{t('model.priceNote')}</CardDescription>
          </Card>
          <Card>
            <CardTitle>{t('model.facts')}</CardTitle>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('table.vendor')}</dt>
              <dd>{m.vendorName}</dd>
              <dt className="text-muted-foreground">{t('model.family')}</dt>
              <dd>{m.family}</dd>
              <dt className="text-muted-foreground">{t('table.released')}</dt>
              <dd>{fmtDate(locale, m.releasedAt)}</dd>
              <dt className="text-muted-foreground">{t('common.openWeights')}</dt>
              <dd>{m.openWeights == null ? t('common.unknown') : m.openWeights ? t('common.yes') : t('common.no')}</dd>
              {m.license && (
                <>
                  <dt className="text-muted-foreground">{t('table.license')}</dt>
                  <dd>{m.license}</dd>
                </>
              )}
              {m.paramsTotal != null && (
                <>
                  <dt className="text-muted-foreground">{t('model.params')}</dt>
                  <dd>
                    {m.paramsActive != null
                      ? t('model.paramsMoe', { total: fmtNum(locale, m.paramsTotal, 0), active: fmtNum(locale, m.paramsActive, 1) })
                      : t('model.paramsValue', { total: fmtNum(locale, m.paramsTotal, 0) })}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('model.modalities')}</dt>
              <dd>{m.modalities.join(', ')}</dd>
            </dl>
          </Card>
        </div>

        {detail.variants.length > per.length && (
          <section>
            <h2 className="text-lg font-semibold">{t('model.variantsHeading')}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{t('model.variantsIntro')}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.leaderboard')}</TableHead>
                  <TableHead>{t('table.variant')}</TableHead>
                  <TableHead>{t('table.rawName')}</TableHead>
                  <TableHead className="text-right">{t('table.rank')}</TableHead>
                  <TableHead className="text-right">{t('table.percentile')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.variants.map((v) => (
                  <TableRow key={`${v.leaderboard}|${v.rawName}`}>
                    <TableCell>{boards.name(v.leaderboard)}</TableCell>
                    <TableCell className="text-xs">{vk(v.variant)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{v.rawName}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.rank != null ? `#${v.rank}` : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(locale, v.percentile, 1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}

        {compareCandidates.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">{t('model.compareWith')}</h2>
            <ul className="flex flex-wrap gap-2">
              {compareCandidates.map((o) => (
                <li key={o.slug}>
                  <Link href={`/${locale}/compare/${canonicalPair(m.slug, o.slug)}`} className="inline-block rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                    {m.name} vs {o.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <Attribution locale={locale} sources={sources} used={usedSources} />
    </article>
  );
}
