import type { Locale } from '@/i18n/routing';
import Link from 'next/link';
import type { ModelListItem } from '@/lib/data';
import { fmtNum } from '@/lib/format';

/** Compact ranked list with a percentile meter (median percentile across boards). */
export function RankList({ locale, models, chinaLabel, metricLabel }: { locale: Locale; models: ModelListItem[]; chinaLabel: string; metricLabel: string }) {
  return (
    <ol className="divide-y divide-border">
      {models.map((m, i) => {
        const p = m.summary?.medianPercentile ?? 0;
        return (
          <li key={m.slug} className="flex items-center gap-3 py-2">
            <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <Link href={`/${locale}/models/${m.slug}`} className="block truncate font-medium hover:underline">
                {m.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {m.vendorName}
                {m.country === 'CN' ? ` · ${chinaLabel}` : ''}
              </span>
            </div>
            <div className="flex w-28 items-center gap-2" title={`${metricLabel}: ${fmtNum(locale, p, 1)}`}>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${p}%`, background: 'var(--series-1)' }} />
              </span>
              <span className="w-9 text-right text-xs tabular-nums">{fmtNum(locale, p, 0)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
