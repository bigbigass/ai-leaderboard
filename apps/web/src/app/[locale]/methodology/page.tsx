import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageHeader } from '@/components/page-header';
import type { Locale } from '@/i18n/routing';
import { localeParams, resolveLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { DISAGREEMENT_THRESHOLD } from '@/lib/site';

export const revalidate = 86400;
export const generateStaticParams = localeParams;
type Props = { params: Promise<{ locale: string }> };

const SECTIONS = ['matching', 'variants', 'percentile', 'disagreement', 'validation', 'sources', 'history'] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: 'methodology' });
  return pageMetadata({ locale, path: '/methodology', title: t('title'), description: t('description') });
}

export default async function MethodologyPage({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  return (
    <article className="max-w-3xl">
      <Breadcrumbs items={[{ name: t('common.nav.home'), href: `/${locale}` }, { name: t('common.nav.methodology'), href: `/${locale}/methodology` }]} />
      <PageHeader title={t('methodology.h1')} intro={t('methodology.intro')} />
      <div className="space-y-6">
        {SECTIONS.map((s) => (
          <section key={s} id={s}>
            <h2 className="mb-1 text-lg font-semibold">{t(`methodology.${s}H`)}</h2>
            <p className="leading-relaxed">{t(`methodology.${s}P`, { threshold: DISAGREEMENT_THRESHOLD })}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
