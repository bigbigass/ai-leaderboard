import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'common' });
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">{t('notFoundTitle')}</h1>
      <p className="mt-2 text-muted-foreground">{t('notFoundBody')}</p>
      <p className="mt-6">
        <Link href={`/${locale}`} className="underline">
          {t('backHome')}
        </Link>
      </p>
    </div>
  );
}
