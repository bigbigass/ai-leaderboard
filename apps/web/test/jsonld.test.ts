import { describe, expect, it } from 'vitest';
import { breadcrumbLd, datasetLd, itemListLd, modelLd, serializeJsonLd, websiteLd } from '@/lib/jsonld';

const roundTrip = (x: unknown) => JSON.parse(serializeJsonLd(x as never)) as Record<string, unknown>;

describe('JSON-LD', () => {
  it('WebSite', () => {
    const d = roundTrip(websiteLd('https://e.com/en', 'en', 'desc'));
    expect(d).toMatchObject({ '@context': 'https://schema.org', '@type': 'WebSite', url: 'https://e.com/en', inLanguage: 'en' });
  });

  it('BreadcrumbList with 1-based positions', () => {
    const d = roundTrip(breadcrumbLd([{ name: 'Home', url: 'https://e.com/en' }, { name: 'Models', url: 'https://e.com/en/models' }]));
    expect(d['@type']).toBe('BreadcrumbList');
    expect(d.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://e.com/en' },
      { '@type': 'ListItem', position: 2, name: 'Models', item: 'https://e.com/en/models' },
    ]);
  });

  it('Dataset carries source attribution and license', () => {
    const d = roundTrip(
      datasetLd({
        name: 'Epoch AI · GPQA Diamond',
        description: 'x',
        url: 'https://e.com/en/leaderboards/epoch/gpqa-diamond',
        locale: 'en',
        dateModified: '2025-09-30',
        sources: [{ name: 'Epoch AI', url: 'https://epoch.ai/benchmarks', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Epoch AI, Data on AI Benchmarking.' }],
      }),
    );
    expect(d).toMatchObject({
      '@type': 'Dataset',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creditText: 'Epoch AI, Data on AI Benchmarking.',
      isBasedOn: ['https://epoch.ai/benchmarks'],
      creator: [{ '@type': 'Organization', name: 'Epoch AI' }],
    });
  });

  it('ItemList of rankings', () => {
    const d = roundTrip(itemListLd('Top', 'https://e.com', [{ name: 'A', url: 'https://e.com/a' }]));
    expect(d).toMatchObject({ '@type': 'ItemList', numberOfItems: 1, itemListElement: [{ '@type': 'ListItem', position: 1, name: 'A' }] });
  });

  it('SoftwareApplication for models, with an Offer only when priced', () => {
    const base = { name: 'M', url: 'https://e.com/m', vendorName: 'V', vendorUrl: null, description: 'd', releasedAt: '2025-01-01', openWeights: true, license: 'MIT' };
    const priced = roundTrip(modelLd({ ...base, pricePromptPerM: 0.25 }));
    expect(priced).toMatchObject({ '@type': 'SoftwareApplication', offers: { '@type': 'Offer', price: 0.25, priceCurrency: 'USD' }, creator: { '@type': 'Organization', name: 'V' } });
    expect(roundTrip(modelLd({ ...base, pricePromptPerM: null })).offers).toBeUndefined();
  });

  it('escapes "<" so data cannot close the script tag', () => {
    const s = serializeJsonLd(websiteLd('https://e.com', 'en', '</script><script>alert(1)</script>'));
    expect(s).not.toContain('</script>');
    expect(JSON.parse(s).description).toBe('</script><script>alert(1)</script>');
  });
});
