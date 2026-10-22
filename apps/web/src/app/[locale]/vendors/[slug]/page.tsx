import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Attribution } from '@/components/attribution';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ModelsTable, orderForTable } from '@/components/models-table';
import { PageHeader } from '@/components/page-header';
import type { Locale } from '@/i18n/routing';
import { getEnabledSources, getModelList, getVendors } from '@/lib/data';
import { resolveLocale } from '@/lib/page';
import { rankModels } from '@/lib/rankings';
import { isHubIndexable, pageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const dynamicParams = true;
type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  return (await getVendors()).map((v) => ({ slug: v.slug }));
}

async function load(slug: string) {
  const [vendors, list] = await Promise.all([getVendors(), getModelList()]);
  const vendor = vendors.find((v) => v.slug === slug);
  if (!vendor) return null;
  const models = list.filter((m) => m.vendorSlug === slug);
  return { vendor, models, ranked: rankModels(models) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const data = await load(slug);
  if (!data) return {};
  const t = await getTranslations({ locale, namespace: 'vendors' });
  return pageMetadata({
    locale,
    path: `/vendors/${slug}`,
    title: t('title', { vendor: data.vendor.name }),
    description: t('description', { vendor: data.vendor.name, count: data.models.length }),
    noindex: !isHubIndexable(data.ranked.length),
  });
}

export default async function VendorPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const t = await getTranslations({ locale });
  const sources = await getEnabledSources();
  const { vendor, models, ranked } = data;
  const region = new Intl.DisplayNames([locale], { type: 'region' });
  return (
    <div>
      <Breadcrumbs
        items={[
          { name: t('common.nav.home'), href: `/${locale}` },
          { name: t('common.nav.vendors'), href: `/${locale}/vendors` },
          { name: vendor.name, href: `/${locale}/vendors/${slug}` },
        ]}
      />
      <PageHeader title={t('vendors.h1', { vendor: vendor.name })} intro={t('vendors.intro', { vendor: vendor.name, country: region.of(vendor.country) ?? vendor.country, count: models.length })}>
        {vendor.website && (
          <a href={vendor.website} className="text-sm underline" rel="noopener" target="_blank">
            {t('vendors.website')}
          </a>
        )}
      </PageHeader>
      {!isHubIndexable(ranked.length) && <p className="mb-4 text-xs text-muted-foreground">{t('common.noindexNote')}</p>}
      <ModelsTable locale={locale} models={orderForTable(ranked, models)} showVendor={false} />
      <Attribution locale={locale} sources={sources} used={sources.map((s) => s.slug)} />
    </div>
  );
}
