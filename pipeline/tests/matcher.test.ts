import { describe, expect, it } from 'vitest';
import { loadCatalog, validateCatalog, type ModelEntry } from '../matcher/catalog';
import { Matcher } from '../matcher/matcher';
import { normalizeName } from '../matcher/normalize';
import { jaroWinkler } from '../matcher/similarity';

const model = (o: Partial<ModelEntry> & { model: string }): ModelEntry => ({
  name: o.model,
  vendor: 'v',
  family: 'f',
  modalities: ['text'],
  aliases: [],
  ...o,
});

const MODELS: ModelEntry[] = [
  model({
    model: 'qwen3-235b-a22b',
    aliases: [
      { source: 'lmarena', name: 'qwen3-235b-a22b', variant: '' },
      { source: 'lmarena', name: 'qwen3-235b-a22b-no-thinking', variant: 'reasoning=off' },
      { source: 'openrouter', name: 'qwen/qwen3-235b-a22b', variant: '' },
    ],
  }),
  model({ model: 'deepseek-v3-0324', aliases: [{ source: 'epoch', name: 'DeepSeek-V3-0324', variant: '' }] }),
  model({ model: 'glm-4-5', aliases: [{ source: 'lmarena', name: 'glm-4.5', variant: '' }] }),
];

describe('normalizeName', () => {
  it('ignores case, whitespace and punctuation only', () => {
    expect(normalizeName('DeepSeek-V3 (0324)')).toBe('deepseekv30324');
    expect(normalizeName('  GLM 4.5 ')).toBe('glm45');
    expect(normalizeName('openai/gpt-4o')).toBe('openaigpt4o'); // vendor prefixes are NOT stripped
  });
});

describe('Matcher (alias table only)', () => {
  const m = () => new Matcher(MODELS);

  it('matches exact aliases with their variant', () => {
    expect(m().match('lmarena', 'qwen3-235b-a22b-no-thinking')).toEqual({ matched: true, modelSlug: 'qwen3-235b-a22b', variantKey: 'reasoning=off', how: 'exact' });
  });

  it('matches normalized-exact (case/whitespace/punctuation) within the same source', () => {
    expect(m().match('epoch', 'deepseek v3 0324')).toMatchObject({ matched: true, modelSlug: 'deepseek-v3-0324', how: 'normalized' });
    expect(m().match('lmarena', 'GLM 4.5')).toMatchObject({ matched: true, modelSlug: 'glm-4-5' });
  });

  it('treats the canonical slug as an alias for any source', () => {
    expect(m().match('livebench', 'deepseek-v3-0324')).toMatchObject({ matched: true, modelSlug: 'deepseek-v3-0324', how: 'exact' });
  });

  it('does not use another source’s alias', () => {
    expect(m().match('lmarena', 'qwen/qwen3-235b-a22b').matched).toBe(false);
  });

  it('sends fuzzy candidates to the review queue and NEVER applies them', () => {
    const matcher = m();
    const r = matcher.match('lmarena', 'qwen3-235b-a22b-instruct-2507', 'Alibaba');
    expect(r.matched).toBe(false);
    if (r.matched) throw new Error('unreachable');
    expect(r.suggestion).toMatchObject({ suggestedModelSlug: 'qwen3-235b-a22b', source: 'lmarena', rawOrg: 'Alibaba' });
    expect(r.suggestion.score!).toBeGreaterThanOrEqual(0.85);
    // Seen again: still unmatched, occurrences counted, still only a suggestion.
    expect(matcher.match('lmarena', 'qwen3-235b-a22b-instruct-2507').matched).toBe(false);
    expect(matcher.reviewQueue()).toEqual([expect.objectContaining({ rawName: 'qwen3-235b-a22b-instruct-2507', occurrences: 2 })]);
    expect(matcher.lookup('lmarena', 'qwen3-235b-a22b-instruct-2507')).toBeNull();
  });

  it('queues names with no plausible candidate without a suggestion', () => {
    const matcher = m();
    matcher.match('lmarena', 'totally-unrelated-zzz');
    expect(matcher.reviewQueue()[0]).toMatchObject({ rawName: 'totally-unrelated-zzz', suggestedModelSlug: null, score: null });
  });

  it("'if-suggested' mode skips noise (metadata sources) but still queues near misses", () => {
    const matcher = m();
    matcher.match('openrouter', 'inception/mercury-coder', null, { queue: 'if-suggested' });
    matcher.match('openrouter', 'qwen/qwen3-235b-a22b:free', null, { queue: 'if-suggested' });
    expect(matcher.reviewQueue().map((q) => q.rawName)).toEqual(['qwen/qwen3-235b-a22b:free']);
  });
});

describe('catalog validation', () => {
  it('loads the committed aliases.yaml (≥ 30 models, ≥ 10 Chinese vendors’ models)', async () => {
    const cat = await loadCatalog();
    const cn = new Set(cat.vendors.filter((v) => v.country === 'CN').map((v) => v.slug));
    expect(cat.models.length).toBeGreaterThanOrEqual(30);
    expect(cat.models.filter((x) => cn.has(x.vendor)).length).toBeGreaterThanOrEqual(10);
  });

  it('rejects aliases that collide across models after normalization', () => {
    const bad = [model({ model: 'a', aliases: [{ source: 'lmarena', name: 'Foo-1', variant: '' }] }), model({ model: 'b', aliases: [{ source: 'lmarena', name: 'foo 1', variant: '' }] })];
    expect(() => validateCatalog(bad, [{ slug: 'v', name: 'V', country: 'US' }])).toThrow(/maps to both/);
  });

  it('rejects unknown vendors and malformed variants', () => {
    expect(() => validateCatalog([model({ model: 'a', vendor: 'nope' })], [{ slug: 'v', name: 'V', country: 'US' }])).toThrow(/unknown vendor/);
    expect(() => validateCatalog([model({ model: 'a', aliases: [{ source: 'x', name: 'y', variant: 'thinking' }] })], [{ slug: 'v', name: 'V', country: 'US' }])).toThrow();
  });
});

describe('jaroWinkler', () => {
  it('is 1 for equal strings, high for near misses, low for unrelated', () => {
    expect(jaroWinkler('abc', 'abc')).toBe(1);
    expect(jaroWinkler('glm45', 'glm45air')).toBeGreaterThan(0.9);
    expect(jaroWinkler('gpt4o', 'llama31405b')).toBeLessThan(0.6);
  });
});
