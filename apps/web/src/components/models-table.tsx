import type { Locale } from '@/i18n/routing';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DisagreementBadge } from './disagreement';
import { ModelLink } from './model-link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import type { ModelListItem } from '@/lib/data';
import { fmtDate, fmtNum, fmtPrice } from '@/lib/format';

/** Cross-board model table (median percentile, coverage, disagreement, price). */
export async function ModelsTable({ locale, models, showVendor = true }: { locale: Locale; models: ModelListItem[]; showVendor?: boolean }) {
  const t = await getTranslations({ locale });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 text-right">#</TableHead>
          <TableHead>{t('table.model')}</TableHead>
          {showVendor && <TableHead>{t('table.vendor')}</TableHead>}
          <TableHead className="text-right">{t('table.median')}</TableHead>
          <TableHead className="text-right">{t('table.coverage')}</TableHead>
          <TableHead>{t('table.disagreement')}</TableHead>
          <TableHead className="text-right">{t('table.price')}</TableHead>
          <TableHead>{t('table.released')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {models.map((m, i) => (
          <TableRow key={m.slug}>
            <TableCell className="text-right text-muted-foreground tabular-nums">{m.summary?.coverage ? i + 1 : '—'}</TableCell>
            <TableCell>
              <ModelLink locale={locale} slug={m.slug} name={m.name} country={m.country} chinaLabel={t('common.china')} />
            </TableCell>
            {showVendor && (
              <TableCell>
                <Link href={`/${locale}/vendors/${m.vendorSlug}`} className="hover:underline">
                  {m.vendorName}
                </Link>
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums">{fmtNum(locale, m.summary?.medianPercentile, 1)}</TableCell>
            <TableCell className="text-right tabular-nums">{m.summary?.coverage ?? 0}</TableCell>
            <TableCell>{m.summary ? <DisagreementBadge locale={locale} flag={m.summary.disagreementFlag} score={m.summary.disagreementScore} /> : '—'}</TableCell>
            <TableCell className="text-right text-xs whitespace-nowrap tabular-nums">
              {m.price ? `${fmtPrice(locale, m.price.prompt)} / ${fmtPrice(locale, m.price.completion)}` : '—'}
            </TableCell>
            <TableCell className="text-xs whitespace-nowrap">{fmtDate(locale, m.releasedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Ranked models first (by median percentile), then unranked ones alphabetically. */
export function orderForTable(ranked: ModelListItem[], all: ModelListItem[]): ModelListItem[] {
  const seen = new Set(ranked.map((m) => m.slug));
  return [...ranked, ...all.filter((m) => !seen.has(m.slug))];
}
