import { THRESHOLDS } from '../config/thresholds';
import { flattenAliases, type FlatAlias, type ModelEntry } from './catalog';
import { normalizeName } from './normalize';
import { jaroWinkler } from './similarity';

export type MatchResult =
  | { matched: true; modelSlug: string; variantKey: string; how: 'exact' | 'normalized' }
  | { matched: false; suggestion: ReviewItem };

export interface ReviewItem {
  source: string;
  rawName: string;
  rawOrg: string | null;
  /** Fuzzy candidate for a human to confirm in aliases.yaml. Never applied automatically. */
  suggestedModelSlug: string | null;
  score: number | null;
  occurrences: number;
}

/**
 * Alias-only matcher: exact, then normalized-exact (case/whitespace/punctuation), against the
 * alias table. Anything else is unmatched; fuzzy similarity only produces review-queue suggestions.
 */
export class Matcher {
  private exact = new Map<string, FlatAlias>();
  private normalized = new Map<string, FlatAlias>();
  private readonly aliases: FlatAlias[];
  private readonly queue = new Map<string, ReviewItem>();

  constructor(models: ModelEntry[] | FlatAlias[]) {
    this.aliases = isFlat(models) ? models : flattenAliases(models);
    for (const a of this.aliases) {
      this.exact.set(`${a.source}|${a.rawName}`, a);
      // Source-specific aliases win over wildcard ones.
      const nk = `${a.source}|${a.normalized}`;
      if (!this.normalized.has(nk) || a.source !== '*') this.normalized.set(nk, a);
    }
  }

  /** Pure lookup: no side effects. */
  lookup(source: string, rawName: string): { modelSlug: string; variantKey: string; how: 'exact' | 'normalized' } | null {
    const name = rawName.trim();
    const hit = this.exact.get(`${source}|${name}`) ?? this.exact.get(`*|${name}`);
    if (hit) return { modelSlug: hit.modelSlug, variantKey: hit.variantKey, how: 'exact' };
    const n = normalizeName(name);
    const nHit = this.normalized.get(`${source}|${n}`) ?? this.normalized.get(`*|${n}`);
    if (nHit) return { modelSlug: nHit.modelSlug, variantKey: nHit.variantKey, how: 'normalized' };
    return null;
  }

  /** Lookup; on a miss the name is queued for human review (with a fuzzy suggestion if any). */
  match(source: string, rawName: string, rawOrg: string | null = null, opts: { queue?: 'always' | 'if-suggested' } = {}): MatchResult {
    const hit = this.lookup(source, rawName);
    if (hit) return { matched: true, ...hit };
    const name = rawName.trim();
    if (opts.queue === 'if-suggested' && !this.queue.has(`${source}|${name}`) && !this.suggest(name)) {
      return { matched: false, suggestion: { source, rawName: name, rawOrg, suggestedModelSlug: null, score: null, occurrences: 1 } };
    }
    return { matched: false, suggestion: this.enqueue(source, name, rawOrg) };
  }

  /** Best fuzzy candidate (Jaro-Winkler on normalized names) or null below the threshold. */
  suggest(rawName: string): { modelSlug: string; score: number } | null {
    const n = normalizeName(rawName);
    let best: { modelSlug: string; score: number } | null = null;
    for (const a of this.aliases) {
      const s = jaroWinkler(n, a.normalized);
      if (!best || s > best.score) best = { modelSlug: a.modelSlug, score: s };
    }
    if (!best || best.score < THRESHOLDS.fuzzySuggestMin) return null;
    return { modelSlug: best.modelSlug, score: Math.round(best.score * 1000) / 1000 };
  }

  private enqueue(source: string, rawName: string, rawOrg: string | null): ReviewItem {
    const key = `${source}|${rawName}`;
    const existing = this.queue.get(key);
    if (existing) {
      existing.occurrences++;
      return existing;
    }
    const s = this.suggest(rawName);
    const item: ReviewItem = { source, rawName, rawOrg, suggestedModelSlug: s?.modelSlug ?? null, score: s?.score ?? null, occurrences: 1 };
    this.queue.set(key, item);
    return item;
  }

  reviewQueue(): ReviewItem[] {
    return [...this.queue.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.rawName.localeCompare(b.rawName));
  }
}

function isFlat(x: ModelEntry[] | FlatAlias[]): x is FlatAlias[] {
  return x.length > 0 && 'normalized' in x[0]!;
}
