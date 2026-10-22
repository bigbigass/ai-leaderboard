import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DisagreementBadge, DisagreementSentence } from '@/components/disagreement';
import { RankList } from '@/components/rank-list';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { getBoards, getEnabledSources, getModelList } from '@/lib/data';
import { localeParams, resolveLocale } from '@/lib/page';
import { biggestDisagreements, CATEGORIES, movers, rankModels, topChina, topGlobal } from '@/lib/rankings';
import { pageMetadata } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

export const revalidate = 86400;
export const generateStaticParams = localeParams;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'home' });
  const models = rankModels(await getModelList());
  return pageMetadata({ locale, path: '', title: t('title'), description: t('description', { count: models.length }) });
}

export default async function HomePage({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  const [list, boards, sources] = await Promise.all([getModelList(), getBoards(), getEnabledSources()]);
  const boardName = (slug: string) => boards.find((b) => b.slug === slug)?.name ?? slug;
  const china = topChina(list);
  const global = topGlobal(list);
  const disagreements = biggestDisagreements(list);
  const moves = movers(list);
  const scoreSources = sources.filter((s) => s.kind === 'scores').map((s) => s.name);
  const usedCats = CATEGORIES.filter((c) => boards.some((b) => b.category === c));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('home.h1')}</h1>
        <p className="max-w-3xl text-muted-foreground">
          {t('home.intro', { boards: boards.length, sources: new Intl.ListFormat(locale, { type: 'conjunction' }).format(scoreSources) })}
        </p>
      </div>

      {!list.length ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-muted-foreground">{t('home.empty')}</p>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardTitle>{t('home.chinaTop')}</CardTitle>
              <RankList locale={locale} models={china} chinaLabel={t('common.china')} metricLabel={t('table.median')} />
              <Link href={`/${locale}/chinese-models`} className="mt-2 inline-block text-sm underline">
                {t('common.viewAll')}
              </Link>
            </Card>
            <Card>
              <CardTitle>{t('home.globalTop')}</CardTitle>
              <RankList locale={locale} models={global} chinaLabel={t('common.china')} metricLabel={t('table.median')} />
              <Link href={`/${locale}/models`} className="mt-2 inline-block text-sm underline">
                {t('common.viewAll')}
              </Link>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardTitle>{t('home.disagreements')}</CardTitle>
              <CardDescription>{t('home.disagreementsIntro')}</CardDescription>
              <ul className="mt-3 space-y-3">
                {disagreements.map((m) => (
                  <li key={m.slug} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/${locale}/models/${m.slug}`} className="font-medium hover:underline">
                        {m.name}
                      </Link>
                      <DisagreementBadge locale={locale} flag={m.summary?.disagreementFlag} score={m.summary?.disagreementScore} />
                    </div>
                    {m.summary?.disagreementPair && (
                      <p className="mt-0.5 text-muted-foreground">
                        <DisagreementSentence locale={locale} pair={m.summary.disagreementPair} boardName={boardName} />
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardTitle>{t('home.movers')}</CardTitle>
              <CardDescription>{t('home.moversIntro')}</CardDescription>
              <ul className="mt-3 divide-y divide-border">
                {moves.map(({ model, delta }) => (
                  <li key={model.slug} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/${locale}/models/${model.slug}`} className="font-medium hover:underline">
                      {model.name}
                    </Link>
                    <span className={delta > 0 ? 'text-good' : 'text-bad'}>
                      {delta > 0 ? '▲ ' : '▼ '}
                      {delta > 0 ? t('home.up', { n: delta }) : t('home.down', { n: -delta })}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card>
            <CardTitle>{t('home.browseCategories')}</CardTitle>
            <ul className="mt-3 flex flex-wrap gap-2">
              {usedCats.map((c) => (
                <li key={c}>
                  <Link href={`/${locale}/categories/${c}`} className="inline-block rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                    {t(`categories.${c}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
