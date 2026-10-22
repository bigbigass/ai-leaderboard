import { modelMeta, type Db } from '@ail/db';
import { sql } from 'drizzle-orm';
import type { Matcher } from '../matcher/matcher';
import type { NormalizedMeta } from '../types';

export interface MetaIngestStats {
  rows: number;
  matched: number;
  upserted: number;
}

/** OpenRouter metadata → model_meta (pricing/context only). Unmatched ids are ignored unless a fuzzy suggestion exists. */
export async function ingestMeta(
  db: Db,
  sourceSlug: string,
  rows: NormalizedMeta[],
  matcher: Matcher,
  modelIds: Map<string, number>,
): Promise<MetaIngestStats> {
  const chosen = new Map<number, NormalizedMeta>();
  let matched = 0;
  for (const r of rows) {
    const m = matcher.match(sourceSlug, r.rawName, null, { queue: 'if-suggested' });
    if (!m.matched) continue;
    const id = modelIds.get(m.modelSlug);
    if (id == null) continue;
    matched++;
    const prev = chosen.get(id);
    // Prefer the entry with a concrete price (":free" or router aliases may be listed too).
    if (!prev || (prev.pricePromptPerM == null && r.pricePromptPerM != null)) chosen.set(id, r);
  }
  await db.transaction(async (tx) => {
    for (const [modelId, r] of chosen) {
      const values = {
        modelId,
        openrouterId: r.rawName,
        contextLength: r.contextLength,
        pricePromptPerM: r.pricePromptPerM,
        priceCompletionPerM: r.priceCompletionPerM,
        inputModalities: r.inputModalities,
        raw: r.raw,
        seenAt: sql`now()`,
      };
      await tx.insert(modelMeta).values(values).onConflictDoUpdate({ target: modelMeta.modelId, set: values });
    }
  });
  return { rows: rows.length, matched, upserted: chosen.size };
}
