import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageHeader } from '@/components/page-header';
import type { Locale } from '@/i18n/routing';
import { getModelList } from '@/lib/data';
import { localeParams, resolveLocale } from '@/lib/page';
import { parsePair, popularPairs } from '@/lib/rankings';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const generateStaticParams = localeParams;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'compare' });
  return pageMetadata({ locale, path: '/compare', title: t('indexTitle'), description: t('indexDescription') });
}

export default async function CompareIndex({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  const list = await getModelList();
  const name = new Map(list.map((m) => [m.slug, m.name]));
  const pairs = popularPairs(list);
  return (
    <div>
      <Breadcrumbs items={[{ name: t('common.nav.home'), href: `/${locale}` }, { name: t('common.nav.compare'), href: `/${locale}/compare` }]} />
      <PageHeader title={t('compare.indexH1')} intro={t('compare.indexIntro')} />
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pairs.map((p) => {
          const ab = parsePair(p)!;
          return (
            <li key={p}>
              <Link href={`/${locale}/compare/${p}`} className="block rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                {name.get(ab.a)} <span className="text-muted-foreground">vs</span> {name.get(ab.b)}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
