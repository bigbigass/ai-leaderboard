import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/i18n/routing';
import { getModelList, getVendors } from '@/lib/data';
import { localeParams, resolveLocale } from '@/lib/page';
import { rankModels } from '@/lib/rankings';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const generateStaticParams = localeParams;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'vendors' });
  return pageMetadata({ locale, path: '/vendors', title: t('indexTitle'), description: t('indexDescription') });
}

export default async function VendorsPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  const [vendors, list] = await Promise.all([getVendors(), getModelList()]);
  const ranked = rankModels(list);
  const region = new Intl.DisplayNames([locale], { type: 'region' });
  return (
    <div>
      <Breadcrumbs items={[{ name: t('common.nav.home'), href: `/${locale}` }, { name: t('common.nav.vendors'), href: `/${locale}/vendors` }]} />
      <PageHeader title={t('vendors.indexH1')} intro={t('vendors.indexDescription')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vendors
          .map((v) => ({ v, models: list.filter((m) => m.vendorSlug === v.slug), best: ranked.find((m) => m.vendorSlug === v.slug) }))
          .filter((x) => x.models.length > 0)
          .map(({ v, models, best }) => (
            <Card key={v.slug}>
              <CardTitle>
                <Link href={`/${locale}/vendors/${v.slug}`} className="hover:underline">
                  {v.name}
                </Link>
              </CardTitle>
              <CardDescription>
                {region.of(v.country)} · {t('vendors.models', { count: models.length })}
              </CardDescription>
              {best && (
                <p className="mt-2 text-sm">
                  <Link href={`/${locale}/models/${best.slug}`} className="hover:underline">
                    {best.name}
                  </Link>
                </p>
              )}
            </Card>
          ))}
      </div>
    </div>
  );
}
