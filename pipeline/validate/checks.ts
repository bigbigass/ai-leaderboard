import { THRESHOLDS } from '../config/thresholds';
import type { ScoreType } from '../types';

export interface SnapshotCandidate {
  leaderboardSlug: string;
  scoreType: ScoreType;
  categoryMapped: boolean;
  rows: { rawName: string; score: number | null; rank: number | null; matched: boolean }[];
}

export interface PreviousSnapshot {
  rowCount: number;
  /** Raw names of the previous snapshot's Top-10 (by rank). */
  top10: string[];
}

export interface ValidationResult {
  critical: string[];
  warn: string[];
}

/**
 * critical → the snapshot is stored with status='rejected', never becomes latest, never published.
 * warn     → logged in pipeline_runs and the run summary; data is still published.
 * (Schema mismatches are raised earlier by the adapter parser and reject the whole source batch.)
 */
export function validateSnapshot(cur: SnapshotCandidate, prev: PreviousSnapshot | null): ValidationResult {
  const critical: string[] = [];
  const warn: string[] = [];
  const n = cur.rows.length;
  const tag = cur.leaderboardSlug;

  if (n === 0) critical.push(`${tag}: empty snapshot`);
  if (prev && prev.rowCount > 0 && n < prev.rowCount * (1 - THRESHOLDS.maxRowDropRatio)) {
    critical.push(`${tag}: row count dropped ${prev.rowCount} → ${n} (> ${THRESHOLDS.maxRowDropRatio * 100}%)`);
  }
  if (cur.scoreType !== 'rank_only' && n > 0 && cur.rows.every((r) => r.score == null)) {
    critical.push(`${tag}: all scores are null`);
  }
  const range = THRESHOLDS.scoreRange[cur.scoreType];
  if (range) {
    const bad = cur.rows.filter((r) => r.score != null && (r.score < range[0] || r.score > range[1]));
    if (bad.length) critical.push(`${tag}: ${bad.length} score(s) outside ${range[0]}–${range[1]} (e.g. ${bad[0]!.rawName}=${bad[0]!.score})`);
  }

  if (!cur.categoryMapped) warn.push(`${tag}: category not in CATEGORY_MAP (mapped to "other")`);
  const matched = cur.rows.filter((r) => r.matched).length;
  if (n > 0 && matched / n < THRESHOLDS.minMatchRate) {
    warn.push(`${tag}: match rate ${Math.round((matched / n) * 100)}% (${matched}/${n})`);
  }
  if (prev && prev.top10.length >= 5) {
    const curTop = new Set(top10(cur.rows));
    const overlap = prev.top10.filter((x) => curTop.has(x)).length / prev.top10.length;
    if (overlap < THRESHOLDS.minTop10Overlap) warn.push(`${tag}: Top-10 overlap with previous snapshot ${Math.round(overlap * 100)}%`);
  }
  return { critical, warn };
}

export function top10(rows: { rawName: string; rank: number | null }[]): string[] {
  return [...rows]
    .filter((r) => r.rank != null)
    .sort((a, b) => a.rank! - b.rank!)
    .slice(0, 10)
    .map((r) => r.rawName);
}
