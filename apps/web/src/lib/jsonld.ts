import { SITE_NAME } from './site';

export type JsonLd = Record<string, unknown> & { '@context': 'https://schema.org'; '@type': string };

export function websiteLd(url: string, locale: string, description: string): JsonLd {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url, inLanguage: locale, description };
}

export function breadcrumbLd(items: { name: string; url: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

export function itemListLd(name: string, url: string, items: { name: string; url: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url,
    numberOfItems: items.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: it.url })),
  };
}

export interface DatasetSource {
  name: string;
  url: string;
  license: string | null;
  licenseUrl: string | null;
  attribution: string;
}

/** Leaderboard dataset with source attribution and license (only enabled sources are ever passed in). */
export function datasetLd(opts: {
  name: string;
  description: string;
  url: string;
  locale: string;
  dateModified: string | null;
  sources: DatasetSource[];
}): JsonLd {
  const primary = opts.sources[0];
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inLanguage: opts.locale,
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    ...(primary?.licenseUrl ? { license: primary.licenseUrl } : {}),
    creditText: opts.sources.map((s) => s.attribution).join(' '),
    isBasedOn: opts.sources.map((s) => s.url),
    creator: opts.sources.map((s) => ({ '@type': 'Organization', name: s.name, url: s.url })),
    publisher: { '@type': 'Organization', name: SITE_NAME },
    isAccessibleForFree: true,
  };
}

export function modelLd(opts: {
  name: string;
  url: string;
  vendorName: string;
  vendorUrl: string | null;
  description: string;
  releasedAt: string | null;
  openWeights: boolean | null;
  license: string | null;
  pricePromptPerM: number | null;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: opts.name,
    url: opts.url,
    description: opts.description,
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'Large language model',
    operatingSystem: 'Cloud API',
    creator: { '@type': 'Organization', name: opts.vendorName, ...(opts.vendorUrl ? { url: opts.vendorUrl } : {}) },
    ...(opts.releasedAt ? { datePublished: opts.releasedAt } : {}),
    ...(opts.license ? { license: opts.license } : {}),
    ...(opts.openWeights != null ? { isAccessibleForFree: opts.openWeights } : {}),
    ...(opts.pricePromptPerM != null
      ? {
          offers: {
            '@type': 'Offer',
            price: opts.pricePromptPerM,
            priceCurrency: 'USD',
            description: 'USD per 1M input tokens (OpenRouter)',
          },
        }
      : {}),
  };
}

/** Serialise for a <script type="application/ld+json"> tag; `<` is escaped so data can't close the tag. */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
