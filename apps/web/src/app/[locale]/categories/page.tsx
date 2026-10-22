import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/i18n/routing';
import { getBoards, getModelList } from '@/lib/data';
import { localeParams, resolveLocale } from '@/lib/page';
import { CATEGORIES, categoryView } from '@/lib/rankings';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const generateStaticParams = localeParams;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'category' });
  return pageMetadata({ locale, path: '/categories', title: t('indexTitle'), description: t('indexDescription') });
}

export default async function CategoriesPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  const [list, boards] = await Promise.all([getModelList(), getBoards()]);
  return (
    <div>
      <Breadcrumbs items={[{ name: t('common.nav.home'), href: `/${locale}` }, { name: t('common.nav.categories'), href: `/${locale}/categories` }]} />
      <PageHeader title={t('category.indexH1')} intro={t('category.indexDescription')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => {
          const v = categoryView(list, boards, c);
          return (
            <Card key={c}>
              <CardTitle>
                <Link href={`/${locale}/categories/${c}`} className="hover:underline">
                  {t(`categories.${c}`)}
                </Link>
              </CardTitle>
              <CardDescription>{t('category.boardsCount', { count: v.boards.length })}</CardDescription>
              {v.rows[0] && (
                <p className="mt-2 text-sm">
                  1.{' '}
                  <Link href={`/${locale}/models/${v.rows[0].model.slug}`} className="font-medium hover:underline">
                    {v.rows[0].model.name}
                  </Link>
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
