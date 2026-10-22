import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Attribution } from '@/components/attribution';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ModelsTable, orderForTable } from '@/components/models-table';
import { PageHeader } from '@/components/page-header';
import type { Locale } from '@/i18n/routing';
import { getBoards, getEnabledSources, getModelList } from '@/lib/data';
import { localeParams, resolveLocale } from '@/lib/page';
import { rankModels } from '@/lib/rankings';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const generateStaticParams = localeParams;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'models' });
  const boards = await getBoards();
  return pageMetadata({ locale, path: '/models', title: t('title'), description: t('description', { count: boards.length }) });
}

export default async function ModelsPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  const [list, sources] = await Promise.all([getModelList(), getEnabledSources()]);
  return (
    <div>
      <Breadcrumbs items={[{ name: t('common.nav.home'), href: `/${locale}` }, { name: t('common.nav.models'), href: `/${locale}/models` }]} />
      <PageHeader title={t('models.h1')} intro={t('models.intro')} />
      <ModelsTable locale={locale} models={orderForTable(rankModels(list), list)} />
      <Attribution locale={locale} sources={sources} used={sources.map((s) => s.slug)} />
    </div>
  );
}
