import { describe, expect, it } from 'vitest';
import { openrouterAdapter, parseOpenRouter } from '../adapters/openrouter';
import { SchemaMismatchError } from '../types';
import { SEED_DIR } from './helpers';

describe('OpenRouter parser (metadata only)', () => {
  it('converts per-token USD strings to per-million prices', () => {
    const [m] = parseOpenRouter({
      data: [{ id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3', context_length: 163840, pricing: { prompt: '0.00000025', completion: '0.00000085' }, architecture: { input_modalities: ['text'] } }],
    });
    expect(m).toMatchObject({ rawName: 'deepseek/deepseek-chat-v3-0324', pricePromptPerM: 0.25, priceCompletionPerM: 0.85, contextLength: 163840, inputModalities: ['text'] });
  });

  it('treats negative (router/variable) prices as unknown', () => {
    const [m] = parseOpenRouter({ data: [{ id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' } }] });
    expect(m!.pricePromptPerM).toBeNull();
    expect(m!.priceCompletionPerM).toBeNull();
  });

  it('raises SchemaMismatchError for malformed payloads', () => {
    expect(() => parseOpenRouter({ models: [] } as never)).toThrow(SchemaMismatchError);
    expect(() => parseOpenRouter({ data: [{ id: 'x' }] })).toThrow(SchemaMismatchError);
  });

  it('is a metadata adapter (never produces scores)', async () => {
    expect(openrouterAdapter.kind).toBe('metadata');
    const out = openrouterAdapter.parse(await openrouterAdapter.fetch({ mode: 'latest', fixtureDir: SEED_DIR }));
    expect(out.length).toBeGreaterThan(20);
    expect(out.every((m) => !('score' in m))).toBe(true);
  });
});
