import { z } from 'zod';

export const UNIFIED_CATEGORIES = [
  'overall',
  'coding',
  'math',
  'reasoning',
  'knowledge',
  'chinese',
  'vision',
  'writing',
  'agent',
  'other',
] as const;
export type UnifiedCategory = (typeof UNIFIED_CATEGORIES)[number];

export const SCORE_TYPES = ['elo', 'percent', 'index', 'rank_only'] as const;
export type ScoreType = (typeof SCORE_TYPES)[number];

export type SourceKind = 'scores' | 'metadata';

/** Static metadata every adapter declares. `enabled` comes from sources.config.ts. */
export interface SourceMeta {
  id: string;
  name: string;
  url: string;
  license: string;
  licenseUrl: string | null;
  attribution: string;
  kind: SourceKind;
}

export interface FetchOptions {
  /** 'latest' = newest published data only; 'full' = complete history (backfill). */
  mode: 'latest' | 'full';
  /** Read the raw payload from committed fixture files instead of the network. */
  fixtureDir?: string;
  /** Override "today" (YYYY-MM-DD) for sources without a published date. */
  today?: string;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const leaderboardDefSchema = z.object({
  boardKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  category: z.enum(UNIFIED_CATEGORIES),
  categoryRaw: z.string().nullable(),
  scoreType: z.enum(SCORE_TYPES),
  higherIsBetter: z.boolean(),
  externalUrl: z.string().url().nullable(),
  /** Whether categoryRaw was found in the category map (false → warn). */
  categoryMapped: z.boolean(),
});
export type LeaderboardDef = z.infer<typeof leaderboardDefSchema>;

const finiteOrNull = z.number().finite().nullable();

export const normalizedScoreSchema = z.object({
  source: z.string().min(1),
  leaderboard: leaderboardDefSchema,
  publishedAt: isoDate,
  batchKey: z.string().nullable(),
  rawName: z.string().min(1),
  rawOrg: z.string().nullable(),
  rank: z.number().int().positive().nullable(),
  score: finiteOrNull,
  scoreLower: finiteOrNull,
  scoreUpper: finiteOrNull,
  votes: z.number().int().nonnegative().nullable(),
  /** false for rows the source republishes from third parties under their own terms (Epoch external rows). */
  redistributable: z.boolean(),
  extra: z.record(z.string(), z.unknown()).nullable(),
});
export type NormalizedScore = z.infer<typeof normalizedScoreSchema>;

/** OpenRouter-style metadata: pricing/context only. Never used as a score. */
export const normalizedMetaSchema = z.object({
  source: z.string().min(1),
  rawName: z.string().min(1),
  displayName: z.string().nullable(),
  contextLength: z.number().int().positive().nullable(),
  pricePromptPerM: z.number().finite().nonnegative().nullable(),
  priceCompletionPerM: z.number().finite().nonnegative().nullable(),
  inputModalities: z.array(z.string()).nullable(),
  raw: z.record(z.string(), z.unknown()),
});
export type NormalizedMeta = z.infer<typeof normalizedMetaSchema>;

interface AdapterBase<Raw> extends SourceMeta {
  fetch(opts: FetchOptions): Promise<Raw>;
}
export interface ScoreAdapter<Raw = unknown> extends AdapterBase<Raw> {
  kind: 'scores';
  parse(raw: Raw): NormalizedScore[];
}
export interface MetaAdapter<Raw = unknown> extends AdapterBase<Raw> {
  kind: 'metadata';
  parse(raw: Raw): NormalizedMeta[];
}
export type SourceAdapter = ScoreAdapter | MetaAdapter;

export class SchemaMismatchError extends Error {
  constructor(source: string, detail: string) {
    super(`[${source}] schema mismatch: ${detail}`);
    this.name = 'SchemaMismatchError';
  }
}

export class NotEnabledError extends Error {
  constructor(source: string) {
    super(`[${source}] source is disabled (enabled=false in sources.config.ts)`);
    this.name = 'NotEnabledError';
  }
}
