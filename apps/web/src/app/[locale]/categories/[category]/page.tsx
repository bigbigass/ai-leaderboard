import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Attribution } from '@/components/attribution';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { JsonLdScript } from '@/components/json-ld';
import { ModelLink } from '@/components/model-link';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/routing';
import { boardPath } from '@/lib/boards';
import { getBoards, getEnabledSources, getModelList } from '@/lib/data';
import { fmtNum } from '@/lib/format';
import { itemListLd } from '@/lib/jsonld';
import { resolveLocale } from '@/lib/page';
import { CATEGORIES, categoryView, isCategory } from '@/lib/rankings';
import { isHubIndexable, pageMetadata } from '@/lib/seo';
import { abs } from '@/lib/site';
import { cn } from '@/lib/utils';

export const revalidate = 86400;
export const dynamicParams = true; // invalid categories hit notFound() below
type Props = { params: Promise<{ locale: string; category: string }> };

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, category } = (await params) as { locale: Locale; category: string };
  if (!isCategory(category)) return {};
  const t = await getTranslations({ locale });
  const v = categoryView(await getModelList(), await getBoards(), category);
  const name = t(`categories.${category}`);
  return pageMetadata({
    locale,
    path: `/categories/${category}`,
    title: t('category.title', { category: name, count: v.boards.length }),
    description: v.rows.length
      ? t('category.description', { category: name, count: v.boards.length, leader: v.rows[0]!.model.name })
      : t('category.descriptionEmpty', { category: name }),
    noindex: !isHubIndexable(v.rows.length),
  });
}

export default async function CategoryPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { category } = await params;
  if (!isCategory(category)) notFound();
  const t = await getTranslations({ locale });
  const [list, boards, sources] = await Promise.all([getModelList(), getBoards(), getEnabledSources()]);
  const v = categoryView(list, boards, category);
  const name = t(`categories.${category}`);
  const url = `/${locale}/categories/${category}`;
  return (
    <div>
      <Breadcrumbs
        items={[
          { name: t('common.nav.home'), href: `/${locale}` },
          { name: t('common.nav.categories'), href: `/${locale}/categories` },
          { name, href: url },
        ]}
      />
      {v.rows.length > 0 && (
        <JsonLdScript data={itemListLd(t('category.h1', { category: name }), abs(url), v.rows.slice(0, 20).map((r) => ({ name: r.model.name, url: abs(`/${locale}/models/${r.model.slug}`) })))} />
      )}
      <PageHeader title={t('category.h1', { category: name })} intro={t('category.intro', { count: v.boards.length, category: name })} />
      {v.rows.length === 0 ? (
        <p className="text-muted-foreground">{t('common.noData')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-right">#</TableHead>
              <TableHead>{t('table.model')}</TableHead>
              <TableHead className="text-right">{t('table.median')}</TableHead>
              {v.boards.map((b) => (
                <TableHead key={b.slug} className="text-right">
                  <Link href={`/${locale}${boardPath(b)}`} className="hover:underline">
                    {b.name}
                  </Link>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {v.rows.map((r, i) => (
              <TableRow key={r.model.slug} className={cn(r.model.country === 'CN' && 'bg-highlight')}>
                <TableCell className="text-right text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  <ModelLink locale={locale} slug={r.model.slug} name={r.model.name} country={r.model.country} chinaLabel={t('common.china')} />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtNum(locale, r.medianPercentile, 1)}</TableCell>
                {v.boards.map((b) => (
                  <TableCell key={b.slug} className="text-right text-xs tabular-nums">
                    {r.boards[b.slug]?.rank != null ? `#${r.boards[b.slug]!.rank}` : '—'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Attribution locale={locale} sources={sources} used={[...new Set(v.boards.map((b) => b.sourceSlug))]} />
    </div>
  );
}
