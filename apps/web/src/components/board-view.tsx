import type { Locale } from '@/i18n/routing';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Attribution } from './attribution';
import { BoardRankingTable } from './board-table';
import { Breadcrumbs } from './breadcrumbs';
import { JsonLdScript } from './json-ld';
import { PageHeader } from './page-header';
import { boardPath } from '@/lib/boards';
import type { BoardTable, SourceInfo } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { datasetLd, itemListLd } from '@/lib/jsonld';
import { abs } from '@/lib/site';

/** Shared body of the latest-board page and the archived-snapshot page. */
export async function BoardView({ locale, table, sources, archived }: { locale: Locale; table: BoardTable; sources: SourceInfo[]; archived: boolean }) {
  const t = await getTranslations({ locale });
  const b = table.board;
  const src = sources.find((s) => s.slug === b.sourceSlug);
  const base = `/${locale}${boardPath(b)}`;
  const url = abs(archived ? `${base}/${table.publishedAt}` : base);
  const date = fmtDate(locale, table.publishedAt);
  return (
    <div>
      <Breadcrumbs
        items={[
          { name: t('common.nav.home'), href: `/${locale}` },
          { name: t('common.nav.leaderboards'), href: `/${locale}/leaderboards` },
          { name: b.sourceName, href: `/${locale}/leaderboards/${b.sourceSlug}` },
          { name: b.name, href: base },
          ...(archived ? [{ name: date, href: `${base}/${table.publishedAt}` }] : []),
        ]}
      />
      {src && (
        <JsonLdScript
          data={[
            datasetLd({
              name: `${b.name} (${table.publishedAt})`,
              description: t('leaderboards.boardDescription', {
                board: b.name,
                count: table.rows.length,
                date,
                leader: table.rows[0]?.modelName ?? '—',
                source: b.sourceName,
              }),
              url,
              locale,
              dateModified: table.publishedAt,
              sources: [{ name: src.name, url: src.homepage ?? b.externalUrl ?? '', license: src.license, licenseUrl: src.licenseUrl, attribution: src.attribution }],
            }),
            itemListLd(
              b.name,
              url,
              table.rows.slice(0, 20).map((r) => ({ name: r.modelName, url: abs(`/${locale}/models/${r.modelSlug}`) })),
            ),
          ]}
        />
      )}
      <PageHeader title={archived ? t('leaderboards.historyTitle', { board: b.name, date }) : t('leaderboards.boardH1', { board: b.name })}>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{t('leaderboards.publishedOn', { date })}</span>
          <span>{t(`categories.${b.category}` as 'categories.overall')}</span>
          {b.externalUrl && (
            <a href={b.externalUrl} className="underline" rel="noopener" target="_blank">
              {t('leaderboards.viewOnSource', { source: b.sourceName })}
            </a>
          )}
        </p>
        {archived && (
          <p className="text-sm">
            {t('leaderboards.historyNote')}{' '}
            <Link href={base} className="underline">
              {t('leaderboards.viewLatest')}
            </Link>
          </p>
        )}
      </PageHeader>
      <BoardRankingTable locale={locale} table={table} />
      {table.historyDates.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">{t('leaderboards.historyHeading')}</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {table.historyDates.map((d) => (
              <li key={d}>
                <Link
                  href={`${base}/${d}`}
                  aria-current={d === table.publishedAt ? 'page' : undefined}
                  className="inline-block rounded-md border border-border px-2 py-1 hover:bg-muted aria-[current]:bg-muted aria-[current]:font-semibold"
                >
                  {fmtDate(locale, d)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Attribution locale={locale} sources={sources} used={[b.sourceSlug]} />
    </div>
  );
}
