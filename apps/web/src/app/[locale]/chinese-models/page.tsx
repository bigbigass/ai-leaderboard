import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Attribution } from '@/components/attribution';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { JsonLdScript } from '@/components/json-ld';
import { ModelsTable, orderForTable } from '@/components/models-table';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/routing';
import { getBoards, getEnabledSources, getModelList } from '@/lib/data';
import { fmtNum } from '@/lib/format';
import { itemListLd } from '@/lib/jsonld';
import { localeParams, resolveLocale } from '@/lib/page';
import { CATEGORIES, categoryView, isChinese, rankModels } from '@/lib/rankings';
import { pageMetadata } from '@/lib/seo';
import { abs } from '@/lib/site';

export const revalidate = 86400;
export const generateStaticParams = localeParams;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'chinese' });
  const cn = (await getModelList()).filter(isChinese);
  return pageMetadata({ locale, path: '/chinese-models', title: t('title'), description: t('description', { count: cn.length }), noindex: cn.length === 0 });
}

export default async function ChineseModelsPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  const [list, boards, sources] = await Promise.all([getModelList(), getBoards(), getEnabledSources()]);
  const cn = list.filter(isChinese);
  const ranked = rankModels(cn);
  const perCat = CATEGORIES.map((c) => {
    const v = categoryView(list, boards, c);
    return { c, cn: v.rows.find((r) => isChinese(r.model)), top: v.rows[0] };
  }).filter((x) => x.cn && x.top);
  const url = `/${locale}/chinese-models`;
  return (
    <div>
      <Breadcrumbs items={[{ name: t('common.nav.home'), href: `/${locale}` }, { name: t('common.nav.chinese'), href: url }]} />
      {ranked.length > 0 && (
        <JsonLdScript data={itemListLd(t('chinese.h1'), abs(url), ranked.slice(0, 20).map((m) => ({ name: m.name, url: abs(`/${locale}/models/${m.slug}`) })))} />
      )}
      <PageHeader title={t('chinese.h1')} intro={t('chinese.intro')} />
      {perCat.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{t('chinese.vsGlobal')}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.category')}</TableHead>
                <TableHead>{t('chinese.bestChinese')}</TableHead>
                <TableHead>{t('chinese.globalLeader')}</TableHead>
                <TableHead className="text-right">{t('chinese.gap')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perCat.map(({ c, cn: best, top }) => (
                <TableRow key={c}>
                  <TableCell>
                    <Link href={`/${locale}/categories/${c}`} className="hover:underline">
                      {t(`categories.${c}`)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/${locale}/models/${best!.model.slug}`} className="hover:underline">
                      {best!.model.name}
                    </Link>{' '}
                    <span className="text-xs text-muted-foreground tabular-nums">{fmtNum(locale, best!.medianPercentile, 1)}</span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/${locale}/models/${top!.model.slug}`} className="hover:underline">
                      {top!.model.name}
                    </Link>{' '}
                    <span className="text-xs text-muted-foreground tabular-nums">{fmtNum(locale, top!.medianPercentile, 1)}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(locale, top!.medianPercentile - best!.medianPercentile, 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
      <ModelsTable locale={locale} models={orderForTable(ranked, cn)} />
      <Attribution locale={locale} sources={sources} used={sources.map((s) => s.slug)} />
    </div>
  );
}
