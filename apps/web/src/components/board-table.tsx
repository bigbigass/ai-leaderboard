import type { Locale } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { ModelLink } from './model-link';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import type { BoardTable } from '@/lib/data';
import { fmtNum, fmtScore, variantKeys } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Full ranking table for one snapshot. Chinese models are highlighted. */
export async function BoardRankingTable({ locale, table }: { locale: Locale; table: BoardTable }) {
  const t = await getTranslations({ locale });
  const elo = table.board.scoreType === 'elo';
  const hasExternal = table.rows.some((r) => !r.redistributable);
  return (
    <Table>
      <TableCaption>
        {t('leaderboards.chineseHighlight')} {elo ? t('leaderboards.scoreElo') : t('leaderboards.scorePercent')}.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 text-right">{t('table.rank')}</TableHead>
          <TableHead>{t('table.model')}</TableHead>
          <TableHead>{t('table.vendor')}</TableHead>
          <TableHead className="text-right">{t('table.score')}</TableHead>
          {elo && <TableHead className="text-right">{t('table.ci')}</TableHead>}
          {elo && <TableHead className="text-right">{t('table.votes')}</TableHead>}
          <TableHead className="text-right">{t('table.percentile')}</TableHead>
          <TableHead>{t('table.variant')}</TableHead>
          <TableHead>{t('table.rawName')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.rows.map((r) => (
          <TableRow key={r.rawName} className={cn(r.country === 'CN' && 'bg-highlight')}>
            <TableCell className="text-right tabular-nums">{r.rank ?? '—'}</TableCell>
            <TableCell>
              <ModelLink locale={locale} slug={r.modelSlug} name={r.modelName} country={r.country} chinaLabel={t('common.china')} />
              {!r.redistributable && (
                <sup title={t('model.external', { source: r.originalSource ?? '—' })} className="ml-0.5 text-muted-foreground">
                  †
                </sup>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{r.vendorName}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtScore(locale, r.score, table.board.scoreType)}</TableCell>
            {elo && (
              <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                {r.scoreLower != null && r.scoreUpper != null ? `${fmtNum(locale, r.scoreLower)}–${fmtNum(locale, r.scoreUpper)}` : '—'}
              </TableCell>
            )}
            {elo && <TableCell className="text-right text-xs tabular-nums">{fmtNum(locale, r.votes)}</TableCell>}
            <TableCell className="text-right tabular-nums">{fmtNum(locale, r.percentile, 1)}</TableCell>
            <TableCell className="text-xs">{variantKeys(r.variant).map((k) => t(`variants.${k}` as 'variants.default')).join(', ')}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{r.rawName}</TableCell>
          </TableRow>
        ))}
        {hasExternal && (
          <TableRow>
            <TableCell colSpan={elo ? 9 : 7} className="text-xs text-muted-foreground">
              † {table.rows.filter((r) => !r.redistributable).map((r) => `${r.modelName}: ${t('model.external', { source: r.originalSource ?? '—' })}`).join(' ')}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
