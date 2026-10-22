'use client';

import type { Locale } from '@/i18n/routing';
import { usePathname } from 'next/navigation';

/** Links to the same page in every locale (slugs are shared across locales). */
export function LocaleSwitcher({ locale, label, names }: { locale: Locale; label: string; names: Record<string, string> }) {
  const pathname = usePathname() ?? `/${locale}`;
  const rest = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '');
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-sm hover:bg-muted" aria-label={label}>
        🌐 {names[locale]}
      </summary>
      <ul className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-border bg-card p-1 shadow-md">
        {Object.entries(names).map(([l, name]) => (
          <li key={l}>
            <a
              href={`/${l}${rest}`}
              hrefLang={l}
              lang={l}
              aria-current={l === locale ? 'true' : undefined}
              className="block rounded px-2 py-1 text-sm hover:bg-muted aria-[current]:font-semibold"
            >
              {name}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
