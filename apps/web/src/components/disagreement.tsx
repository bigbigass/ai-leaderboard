import type { Locale } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import type { DisagreementPair } from '@ail/db/schema';
import { Badge } from './ui/badge';
import { topPct } from '@/lib/format';

export async function DisagreementBadge({ locale, flag, score }: { locale: Locale; flag: string | undefined; score: number | null | undefined }) {
  const t = await getTranslations({ locale, namespace: 'disagreement' });
  if (flag !== 'flagged' || score == null) return <Badge variant="secondary">{t('none')}</Badge>;
  return (
    <Badge variant="warn">
      ⚠ {t('flagged')} · {t('points', { points: Math.round(score) })}
    </Badge>
  );
}

export async function DisagreementSentence({ locale, pair, boardName }: { locale: Locale; pair: DisagreementPair; boardName: (slug: string) => string }) {
  const t = await getTranslations({ locale });
  return (
    <>
      {t('disagreement.explain', {
        category: t(`categories.${pair.category}` as 'categories.overall'),
        high: topPct(pair.high.percentile),
        highBoard: boardName(pair.high.leaderboard),
        low: topPct(pair.low.percentile),
        lowBoard: boardName(pair.low.leaderboard),
        points: Math.round(pair.high.percentile - pair.low.percentile),
      })}
    </>
  );
}
