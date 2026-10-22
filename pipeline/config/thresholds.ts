/** Tunables for compute + validation. Change here, not inline. */
export const THRESHOLDS = {
  /** Percentile spread (0–100) across boards in one category that flags a disagreement. */
  disagreementPoints: Number(process.env.DISAGREEMENT_THRESHOLD ?? 25),
  /** critical: a snapshot with fewer rows than (1 - x) × previous good snapshot is rejected. */
  maxRowDropRatio: 0.3,
  /** warn: matched/total below this ratio. */
  minMatchRate: 0.85,
  /** warn: Top-10 overlap with the previous snapshot below this ratio. */
  minTop10Overlap: 0.5,
  /** Fuzzy suggestions (review queue only) at or above this Jaro-Winkler similarity. */
  fuzzySuggestMin: 0.85,
  /** Plausible score ranges by score type (critical when violated). */
  scoreRange: {
    elo: [600, 2500],
    percent: [0, 100],
    index: [0, 100],
  } as Record<string, [number, number]>,
} as const;
