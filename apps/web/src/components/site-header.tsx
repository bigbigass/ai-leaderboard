import type { Locale } from '@/i18n/routing';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from './locale-switcher';

export const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  zh: '中文',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  ja: '日本語',
  pt: 'Português',
};

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'common' });
  const links = [
    ['models', '/models'],
    ['leaderboards', '/leaderboards'],
    ['categories', '/categories'],
    ['chinese', '/chinese-models'],
    ['compare', '/compare'],
    ['vendors', '/vendors'],
  ] as const;
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href={`/${locale}`} className="font-semibold tracking-tight">
          {t('siteName')}
        </Link>
        <nav className="order-3 flex w-full gap-1 overflow-x-auto text-sm sm:order-2 sm:w-auto sm:flex-1">
          {links.map(([key, href]) => (
            <Link key={key} href={`/${locale}${href}`} className="rounded-md px-2 py-1 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground">
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
        <div className="order-2 ml-auto sm:order-3">
          <LocaleSwitcher locale={locale} label={t('language')} names={LOCALE_NAMES} />
        </div>
      </div>
    </header>
  );
}
