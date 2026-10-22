import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { SchemaMismatchError, type MetaAdapter, type NormalizedMeta } from '../types';
import { fetchWithRetry, toInt, toNum, toStr } from './base';

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

const modelSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().optional(),
  context_length: z.unknown().optional(),
  pricing: z.looseObject({ prompt: z.unknown(), completion: z.unknown() }),
  architecture: z.looseObject({ input_modalities: z.array(z.string()).optional() }).optional(),
});
const payloadSchema = z.object({ data: z.array(z.unknown()) });

export type OpenRouterRaw = z.infer<typeof payloadSchema>;

/** OpenRouter prices are USD per token as strings; "-1"/negative = variable (router) pricing. */
function perMillion(v: unknown): number | null {
  const n = toNum(v);
  if (n == null || n < 0) return null;
  return Math.round(n * 1e6 * 10_000) / 10_000;
}

export function parseOpenRouter(raw: OpenRouterRaw): NormalizedMeta[] {
  const payload = payloadSchema.safeParse(raw);
  if (!payload.success) throw new SchemaMismatchError('openrouter', 'payload has no data[] array');
  const out: NormalizedMeta[] = [];
  for (const [i, item] of payload.data.data.entries()) {
    const m = modelSchema.safeParse(item);
    if (!m.success) {
      throw new SchemaMismatchError('openrouter', `data[${i}]: ${m.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
    }
    const d = m.data;
    const ctx = toInt(d.context_length);
    out.push({
      source: 'openrouter',
      rawName: d.id,
      displayName: toStr(d.name),
      contextLength: ctx && ctx > 0 ? ctx : null,
      pricePromptPerM: perMillion(d.pricing.prompt),
      priceCompletionPerM: perMillion(d.pricing.completion),
      inputModalities: d.architecture?.input_modalities ?? null,
      raw: d as Record<string, unknown>,
    });
  }
  return out;
}

export const openrouterAdapter: MetaAdapter<OpenRouterRaw> = {
  id: 'openrouter',
  name: 'OpenRouter',
  url: 'https://openrouter.ai/models',
  license: 'Public API metadata (pricing, context length); not used for rankings',
  licenseUrl: 'https://openrouter.ai/terms',
  attribution: 'Model pricing and context length via the public OpenRouter models API.',
  kind: 'metadata',

  async fetch(opts) {
    if (opts.fixtureDir) {
      return JSON.parse(await readFile(path.join(opts.fixtureDir, 'openrouter.json'), 'utf8')) as OpenRouterRaw;
    }
    return (await (await fetchWithRetry(OPENROUTER_MODELS_URL)).json()) as OpenRouterRaw;
  },

  parse: parseOpenRouter,
};
