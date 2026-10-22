import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  char,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Dimension tables ----------------------------------------------------------

export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  country: char('country', { length: 2 }).notNull(),
  website: text('website'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const models = pgTable(
  'models',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    vendorId: integer('vendor_id')
      .notNull()
      .references(() => vendors.id),
    family: text('family').notNull(),
    paramsTotal: doublePrecision('params_total'),
    paramsActive: doublePrecision('params_active'),
    openWeights: boolean('open_weights'),
    license: text('license'),
    modalities: text('modalities').array().default(sql`'{text}'::text[]`).notNull(),
    releasedAt: date('released_at'),
    status: text('status').default('active').notNull(), // active|deprecated|hidden
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('models_vendor_idx').on(t.vendorId), index('models_family_idx').on(t.family)],
);

/** Read-only mirror of pipeline/data/aliases.yaml. */
export const modelAliases = pgTable(
  'model_aliases',
  {
    id: serial('id').primaryKey(),
    modelId: integer('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    sourceSlug: text('source_slug').notNull(),
    rawName: text('raw_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    variantKey: text('variant_key').default('').notNull(),
  },
  (t) => [
    uniqueIndex('model_aliases_source_raw_uq').on(t.sourceSlug, t.rawName),
    index('model_aliases_norm_idx').on(t.sourceSlug, t.normalizedName),
  ],
);

export const sources = pgTable('sources', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  homepage: text('homepage'),
  license: text('license'),
  licenseUrl: text('license_url'),
  attribution: text('attribution').notNull(),
  kind: text('kind').notNull(), // scores|metadata
  enabled: boolean('enabled').default(false).notNull(),
});

export const leaderboards = pgTable(
  'leaderboards',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(), // 'lmarena-text-overall'
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id),
    boardKey: text('board_key').notNull(), // 'text-overall' (URL segment under /leaderboards/[source])
    name: text('name').notNull(),
    category: text('category').notNull(), // UnifiedCategory
    categoryRaw: text('category_raw'),
    scoreType: text('score_type').notNull(), // elo|percent|index|rank_only
    higherIsBetter: boolean('higher_is_better').default(true).notNull(),
    externalUrl: text('external_url'),
    description: text('description'),
  },
  (t) => [uniqueIndex('leaderboards_source_board_uq').on(t.sourceId, t.boardKey)],
);

// Fact tables ---------------------------------------------------------------

export const snapshots = pgTable(
  'snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    leaderboardId: integer('leaderboard_id')
      .notNull()
      .references(() => leaderboards.id),
    publishedAt: date('published_at').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
    batchKey: text('batch_key'),
    contentHash: text('content_hash').notNull(),
    rowCount: integer('row_count').notNull(),
    matchedCount: integer('matched_count').notNull(),
    status: text('status').default('ok').notNull(), // ok|rejected
    rejectReason: text('reject_reason'),
    isLatest: boolean('is_latest').default(false).notNull(),
    runId: bigint('run_id', { mode: 'number' }),
  },
  (t) => [
    uniqueIndex('snapshots_lb_date_hash_uq').on(t.leaderboardId, t.publishedAt, t.contentHash),
    index('snapshots_latest_idx').on(t.leaderboardId).where(sql`${t.isLatest}`),
    index('snapshots_lb_date_idx').on(t.leaderboardId, t.publishedAt),
  ],
);

export const leaderboardEntries = pgTable(
  'leaderboard_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    snapshotId: bigint('snapshot_id', { mode: 'number' })
      .notNull()
      .references(() => snapshots.id, { onDelete: 'cascade' }),
    modelId: integer('model_id').references(() => models.id), // NULL = unmatched, never published
    variantKey: text('variant_key').default('').notNull(),
    rawName: text('raw_name').notNull(),
    rawOrg: text('raw_org'),
    rank: integer('rank'),
    score: doublePrecision('score'),
    scoreLower: doublePrecision('score_lower'),
    scoreUpper: doublePrecision('score_upper'),
    votes: integer('votes'),
    percentile: doublePrecision('percentile'),
    redistributable: boolean('redistributable').default(true).notNull(),
    extra: jsonb('extra').$type<Record<string, unknown>>(),
  },
  (t) => [
    index('entries_snapshot_idx').on(t.snapshotId),
    index('entries_model_idx').on(t.modelId, t.snapshotId),
    index('entries_unmatched_idx').on(t.rawName).where(sql`${t.modelId} IS NULL`),
  ],
);

// Metadata (OpenRouter: pricing/context only, never a score) --------------

export const modelMeta = pgTable('model_meta', {
  modelId: integer('model_id')
    .primaryKey()
    .references(() => models.id, { onDelete: 'cascade' }),
  openrouterId: text('openrouter_id').notNull(),
  contextLength: integer('context_length'),
  pricePromptPerM: doublePrecision('price_prompt_per_m'),
  priceCompletionPerM: doublePrecision('price_completion_per_m'),
  inputModalities: text('input_modalities').array(),
  seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
  raw: jsonb('raw'),
});

// Derived tables (fully recomputed by `pipeline compute`) -----------------

export interface PerLeaderboardEntry {
  leaderboard: string;
  source: string;
  category: string;
  rank: number | null;
  score: number | null;
  scoreLower: number | null;
  scoreUpper: number | null;
  percentile: number;
  variant: string;
  rawName: string;
  publishedAt: string;
}

export interface DisagreementPair {
  category: string;
  high: { leaderboard: string; percentile: number; rank: number | null };
  low: { leaderboard: string; percentile: number; rank: number | null };
}

export const modelSummaries = pgTable(
  'model_summaries',
  {
    modelId: integer('model_id')
      .primaryKey()
      .references(() => models.id, { onDelete: 'cascade' }),
    coverage: integer('coverage').notNull(),
    sourceCount: integer('source_count').notNull(),
    medianPercentile: doublePrecision('median_percentile'),
    bestPercentile: doublePrecision('best_percentile'),
    worstPercentile: doublePrecision('worst_percentile'),
    overallPercentile: doublePrecision('overall_percentile'),
    disagreementScore: doublePrecision('disagreement_score'),
    disagreementFlag: text('disagreement_flag').default('none').notNull(), // none|flagged
    disagreementPair: jsonb('disagreement_pair').$type<DisagreementPair | null>(),
    rankDelta7d: doublePrecision('rank_delta_7d'),
    rankDelta30d: doublePrecision('rank_delta_30d'),
    perLeaderboard: jsonb('per_leaderboard').$type<PerLeaderboardEntry[]>().notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('summaries_disagree_idx').on(t.disagreementScore)],
);

export const modelHistory = pgTable(
  'model_history',
  {
    modelId: integer('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    leaderboardId: integer('leaderboard_id')
      .notNull()
      .references(() => leaderboards.id),
    publishedAt: date('published_at').notNull(),
    rank: integer('rank'),
    score: doublePrecision('score'),
    percentile: doublePrecision('percentile'),
    batchKey: text('batch_key'),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.leaderboardId, t.publishedAt] })],
);

// Operational tables --------------------------------------------------------

/** Unmatched raw names + fuzzy suggestions. Never auto-applied: approval = editing aliases.yaml. */
export const matchReviewQueue = pgTable(
  'match_review_queue',
  {
    id: serial('id').primaryKey(),
    sourceSlug: text('source_slug').notNull(),
    rawName: text('raw_name').notNull(),
    rawOrg: text('raw_org'),
    suggestedModelSlug: text('suggested_model_slug'),
    suggestionScore: doublePrecision('suggestion_score'),
    occurrences: integer('occurrences').default(1).notNull(),
    status: text('status').default('pending').notNull(), // pending|resolved|ignored
    firstSeen: timestamp('first_seen', { withTimezone: true }).defaultNow().notNull(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('review_source_raw_uq').on(t.sourceSlug, t.rawName)],
);

export const pipelineRuns = pgTable('pipeline_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  sourceSlug: text('source_slug').notNull(),
  mode: text('mode').notNull(), // run|backfill|seed
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(), // running|ok|warn|failed
  stats: jsonb('stats').$type<Record<string, unknown>>(),
  warnings: jsonb('warnings').$type<string[]>(),
  error: text('error'),
});
