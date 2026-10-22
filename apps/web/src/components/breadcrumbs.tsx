import Link from 'next/link';
import { JsonLdScript } from './json-ld';
import { breadcrumbLd } from '@/lib/jsonld';
import { abs } from '@/lib/site';

/** Visible breadcrumbs + BreadcrumbList JSON-LD. `href` values are site paths ("/en/models"). */
export function Breadcrumbs({ items }: { items: { name: string; href: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={it.href} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {i < items.length - 1 ? (
              <Link href={it.href} className="hover:underline">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {it.name}
              </span>
            )}
          </li>
        ))}
      </ol>
      <JsonLdScript data={breadcrumbLd(items.map((it) => ({ name: it.name, url: abs(it.href) })))} />
    </nav>
  );
}
