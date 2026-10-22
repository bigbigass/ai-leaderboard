import type { Locale } from '@/i18n/routing';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-xs text-muted-foreground">
        <p>{t('footer.disclaimer')}</p>
        <p className="flex flex-wrap gap-4">
          <Link href={`/${locale}/sources`} className="underline">
            {t('footer.sourcesLink')}
          </Link>
          <Link href={`/${locale}/methodology`} className="underline">
            {t('footer.methodologyLink')}
          </Link>
        </p>
      </div>
    </footer>
  );
}
