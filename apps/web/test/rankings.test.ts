import { describe, expect, it } from 'vitest';
import { biggestDisagreements, canonicalPair, categoryView, parsePair, popularPairs, rankModels, topChina } from '@/lib/rankings';
import { board, entry, model } from './fixtures';

describe('compare slugs', () => {
  it('parses a-vs-b and rejects malformed or self pairs', () => {
    expect(parsePair('gpt-5-vs-deepseek-v3-1')).toEqual({ a: 'gpt-5', b: 'deepseek-v3-1' });
    expect(parsePair('gpt-5')).toBeNull();
    expect(parsePair('-vs-x')).toBeNull();
    expect(parsePair('a-vs-a')).toBeNull();
    expect(parsePair('a-vs-b-vs-c')).toBeNull();
  });

  it('canonical order is alphabetical', () => {
    expect(canonicalPair('qwen3', 'gpt-5')).toBe('gpt-5-vs-qwen3');
    expect(canonicalPair('gpt-5', 'qwen3')).toBe('gpt-5-vs-qwen3');
  });

  it('popular pairs are canonical and unique', () => {
    const list = [
      model('ds', { country: 'CN', boards: [entry('lmarena-a', 90)] }),
      model('qw', { country: 'CN', boards: [entry('lmarena-a', 80)] }),
      model('gpt', { boards: [entry('lmarena-a', 95)] }),
    ];
    const pairs = popularPairs(list);
    expect(pairs).toEqual(['ds-vs-gpt', 'ds-vs-qw', 'gpt-vs-qw']);
    for (const p of pairs) {
      const ab = parsePair(p)!;
      expect(canonicalPair(ab.a, ab.b)).toBe(p);
    }
  });
});

describe('rankings', () => {
  const list = [
    model('a', { boards: [entry('lmarena-x', 60)] }),
    model('b', { country: 'CN', boards: [entry('lmarena-x', 90)] }),
    model('c', { country: 'CN', boards: [entry('lmarena-x', 70)] }),
    model('unranked'),
  ];

  it('orders by median percentile and drops unranked models', () => {
    expect(rankModels(list).map((m) => m.slug)).toEqual(['b', 'c', 'a']);
    expect(topChina(list).map((m) => m.slug)).toEqual(['b', 'c']);
  });

  it('biggest disagreements only include flagged models, by score', () => {
    const flagged = (slug: string, score: number) => {
      const m = model(slug, { boards: [entry('lmarena-x', 50)] });
      m.summary!.disagreementFlag = 'flagged';
      m.summary!.disagreementScore = score;
      return m;
    };
    expect(biggestDisagreements([flagged('x', 30), model('y', { boards: [entry('lmarena-x', 1)] }), flagged('z', 60)]).map((m) => m.slug)).toEqual(['z', 'x']);
  });

  it('category view merges boards of one category by median percentile', () => {
    const boards = [board('lmarena-text-coding', 'coding'), board('epoch-swe', 'coding'), board('lmarena-text-math', 'math')];
    const ms = [
      model('a', { boards: [entry('lmarena-text-coding', 90, { category: 'coding' }), entry('epoch-swe', 30, { category: 'coding' }), entry('lmarena-text-math', 100, { category: 'math' })] }),
      model('b', { boards: [entry('lmarena-text-coding', 70, { category: 'coding' })] }),
    ];
    const v = categoryView(ms, boards, 'coding');
    expect(v.boards.map((b) => b.slug)).toEqual(['lmarena-text-coding', 'epoch-swe']);
    expect(v.rows.map((r) => [r.model.slug, r.medianPercentile])).toEqual([
      ['b', 70],
      ['a', 60],
    ]);
    expect(categoryView(ms, boards, 'vision').rows).toEqual([]);
  });
});
