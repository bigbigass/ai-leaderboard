import type { Locale } from '@/i18n/routing';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { SourceInfo } from '@/lib/data';

/** Attribution for every source whose data is shown on the page (required for Epoch AI, CC BY). */
export async function Attribution({ locale, sources, used }: { locale: Locale; sources: SourceInfo[]; used: string[] }) {
  const shown = sources.filter((s) => used.includes(s.slug));
  if (!shown.length) return null;
  const t = await getTranslations({ locale, namespace: 'sources' });
  return (
    <aside className="mt-8 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground" aria-label={t('attribution')}>
      <p className="font-medium text-foreground">{t('attribution')}</p>
      <ul className="mt-1 space-y-1">
        {shown.map((s) => (
          <li key={s.slug}>
            <a href={s.homepage ?? '#'} className="underline" rel="noopener" target="_blank">
              {s.name}
            </a>
            {' — '}
            {s.attribution}{' '}
            {s.licenseUrl ? (
              <a href={s.licenseUrl} className="underline" rel="license noopener" target="_blank">
                {s.license}
              </a>
            ) : (
              s.license
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1">
        <Link href={`/${locale}/sources`} className="underline">
          {t('h1')}
        </Link>
      </p>
    </aside>
  );
}
