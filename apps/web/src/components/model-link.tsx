import type { Locale } from '@/i18n/routing';
import Link from 'next/link';
import { Badge } from './ui/badge';

export function ModelLink({ locale, slug, name, country, chinaLabel }: { locale: Locale; slug: string; name: string; country?: string; chinaLabel?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link href={`/${locale}/models/${slug}`} className="font-medium hover:underline">
        {name}
      </Link>
      {country === 'CN' && chinaLabel ? (
        <Badge variant="accent" title={chinaLabel}>
          {chinaLabel}
        </Badge>
      ) : null}
    </span>
  );
}
