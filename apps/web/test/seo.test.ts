import { describe, expect, it } from 'vitest';
import { isCompareIndexable, isHubIndexable, isModelIndexable, languageAlternates, pageMetadata } from '@/lib/seo';
import { entry, model } from './fixtures';

describe('hreflang + canonical', () => {
  it('lists all 7 locales plus x-default → en', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com/';
    const alt = languageAlternates('/models/gpt-5');
    expect(Object.keys(alt).sort()).toEqual(['de', 'en', 'es', 'fr', 'ja', 'pt', 'x-default', 'zh']);
    expect(alt['x-default']).toBe('https://example.com/en/models/gpt-5');
    expect(alt.zh).toBe('https://example.com/zh/models/gpt-5');
  });

  it('pageMetadata sets a self canonical and robots', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
    const m = pageMetadata({ locale: 'ja', path: '', title: 't', description: 'd', noindex: true });
    expect(m.alternates?.canonical).toBe('https://example.com/ja');
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(pageMetadata({ locale: 'en', path: '/x', title: 't', description: 'd' }).robots).toEqual({ index: true, follow: true });
  });
});

describe('thin-page rules', () => {
  const price = { openrouterId: 'x', prompt: 1, completion: 2, contextLength: 1000 };

  it('model: noindex when < 2 sources and no price, or no data at all', () => {
    expect(isModelIndexable(model('a', { boards: [entry('lmarena-text-overall', 50)] }))).toBe(false);
    expect(isModelIndexable(model('a', { boards: [entry('lmarena-text-overall', 50)], price }))).toBe(true);
    expect(isModelIndexable(model('a', { boards: [entry('lmarena-text-overall', 50), entry('epoch-gpqa', 50)] }))).toBe(true);
    expect(isModelIndexable(model('a', { price }))).toBe(false);
  });

  it('compare: noindex when the two models share < 2 boards', () => {
    const a = model('a', { boards: [entry('lmarena-x', 1), entry('lmarena-y', 1), entry('epoch-z', 1)] });
    const b = model('b', { boards: [entry('lmarena-x', 1), entry('epoch-z', 1)] });
    const c = model('c', { boards: [entry('lmarena-x', 1)] });
    expect(isCompareIndexable(a, b)).toBe(true);
    expect(isCompareIndexable(a, c)).toBe(false);
  });

  it('hubs: noindex when empty', () => {
    expect(isHubIndexable(0)).toBe(false);
    expect(isHubIndexable(3)).toBe(true);
  });
});

describe('data layer fallback', () => {
  it('recognises wrapped connection / missing-schema errors', async () => {
    const { isConnectionError } = await import('@/lib/data');
    const wrapped = Object.assign(new Error('Failed query: select 1'), { cause: Object.assign(new Error('write CONNECT_TIMEOUT 10.0.0.1:5432'), { code: 'CONNECT_TIMEOUT' }) });
    expect(isConnectionError(wrapped)).toBe(true);
    expect(isConnectionError(Object.assign(new Error('Failed query'), { cause: { code: '42P01', message: 'relation "models" does not exist' } }))).toBe(true);
    expect(isConnectionError(new Error('syntax error at or near "asc"'))).toBe(false);
  });
});
