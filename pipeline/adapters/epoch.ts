import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import Papa from 'papaparse';
import { mapCategory } from '../categories';
import { SchemaMismatchError, type NormalizedScore, type ScoreAdapter } from '../types';
import { fetchWithRetry, toIsoDate, toNum, toStr, todayUtc } from './base';

export const EPOCH_ZIP_URL = 'https://epoch.ai/data/benchmark_data.zip';

export interface EpochRaw {
  /** Date the data was captured; Epoch CSVs carry no snapshot date. */
  capturedOn: string;
  /** CSV file name (basename) → CSV text. */
  files: Record<string, string>;
}

/** Benchmarks we publish. Each becomes one leaderboard: /leaderboards/epoch/<boardKey>. */
export const EPOCH_BENCHMARKS = [
  { file: 'gpqa_diamond', boardKey: 'gpqa-diamond', name: 'Epoch AI · GPQA Diamond' },
  { file: 'frontiermath', boardKey: 'frontiermath', name: 'Epoch AI · FrontierMath' },
  { file: 'otis_mock_aime', boardKey: 'otis-mock-aime', name: 'Epoch AI · OTIS Mock AIME' },
  { file: 'swe_bench_verified', boardKey: 'swe-bench-verified', name: 'Epoch AI · SWE-bench Verified' },
] as const;

// Column names have shifted across Epoch exports; accept the known spellings.
const COLS = {
  model: ['Model version', 'model_version', 'Model', 'model'],
  score: ['Best score (across scorers)', 'mean_score', 'Score', 'score'],
  org: ['Organization', 'organization'],
  stderr: ['Stderr', 'stderr'],
  source: ['Source', 'source'],
  sourceLink: ['Source link', 'source_link'],
  release: ['Release date', 'release_date'],
};

function pick(header: string[], names: readonly string[]): string | null {
  return names.find((n) => header.includes(n)) ?? null;
}

/** Rows whose Source is Epoch's own evaluation are redistributable; external rows keep their own license. */
export function isEpochOwnRow(source: string | null): boolean {
  if (!source) return true;
  return /^epoch( ai)?(\s*evaluations?)?$/i.test(source.trim());
}

export function parseEpoch(raw: EpochRaw): NormalizedScore[] {
  const out: NormalizedScore[] = [];
  for (const bench of EPOCH_BENCHMARKS) {
    const fileName = Object.keys(raw.files).find((f) => path.basename(f).replace(/\.csv$/i, '') === bench.file);
    if (!fileName) continue;
    const parsed = Papa.parse<Record<string, string>>(raw.files[fileName]!, { header: true, skipEmptyLines: true });
    const header = parsed.meta.fields ?? [];
    const modelCol = pick(header, COLS.model);
    const scoreCol = pick(header, COLS.score);
    if (!modelCol || !scoreCol) {
      throw new SchemaMismatchError('epoch', `${fileName}: missing model/score column (have: ${header.join(', ')})`);
    }
    const orgCol = pick(header, COLS.org);
    const srcCol = pick(header, COLS.source);
    const linkCol = pick(header, COLS.sourceLink);
    const relCol = pick(header, COLS.release);
    const errCol = pick(header, COLS.stderr);

    // One row per model version: keep the best score.
    const best = new Map<string, Record<string, string>>();
    for (const row of parsed.data) {
      const name = toStr(row[modelCol]);
      const score = toNum(row[scoreCol]);
      if (!name || score == null) continue;
      const prev = best.get(name);
      if (!prev || (toNum(prev[scoreCol]) ?? -Infinity) < score) best.set(name, row);
    }
    const rows = [...best.entries()]
      .map(([name, row]) => {
        let score = toNum(row[scoreCol])!;
        if (score <= 1) score *= 100; // Epoch publishes accuracy as a 0–1 fraction
        return { name, row, score: Math.round(score * 100) / 100 };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const { category, mapped } = mapCategory(`epoch:${bench.file}`);
    let rank = 0;
    let prevScore = Number.NaN;
    rows.forEach((r, i) => {
      if (r.score !== prevScore) rank = i + 1;
      prevScore = r.score;
      const src = srcCol ? toStr(r.row[srcCol]) : null;
      const stderr = errCol ? toNum(r.row[errCol]) : null;
      const se = stderr == null ? null : stderr <= 1 ? stderr * 100 : stderr;
      out.push({
        source: 'epoch',
        leaderboard: {
          boardKey: bench.boardKey,
          name: bench.name,
          category,
          categoryRaw: bench.file,
          scoreType: 'percent',
          higherIsBetter: true,
          externalUrl: 'https://epoch.ai/benchmarks',
          categoryMapped: mapped,
        },
        publishedAt: raw.capturedOn,
        batchKey: null,
        rawName: r.name,
        rawOrg: orgCol ? toStr(r.row[orgCol]) : null,
        rank,
        score: r.score,
        scoreLower: se == null ? null : Math.round((r.score - 1.96 * se) * 100) / 100,
        scoreUpper: se == null ? null : Math.round((r.score + 1.96 * se) * 100) / 100,
        votes: null,
        redistributable: isEpochOwnRow(src),
        extra: {
          originalSource: src,
          sourceLink: linkCol ? toStr(r.row[linkCol]) : null,
          releaseDate: relCol ? toIsoDate(r.row[relCol]) : null,
        },
      });
    });
  }
  if (out.length === 0) throw new SchemaMismatchError('epoch', 'no known benchmark CSV found in payload');
  return out;
}

export const epochAdapter: ScoreAdapter<EpochRaw> = {
  id: 'epoch',
  name: 'Epoch AI',
  url: 'https://epoch.ai/benchmarks',
  license: 'CC BY 4.0 (Epoch AI evaluations; external rows keep their original license)',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Epoch AI, “Data on AI Benchmarking”. Published online at epoch.ai. CC BY 4.0.',
  kind: 'scores',

  async fetch(opts) {
    if (opts.fixtureDir) {
      const dir = path.join(opts.fixtureDir, 'epoch');
      const files: Record<string, string> = {};
      for (const f of await readdir(dir)) {
        if (f.endsWith('.csv')) files[f] = await readFile(path.join(dir, f), 'utf8');
      }
      const meta = JSON.parse(await readFile(path.join(dir, '_meta.json'), 'utf8')) as { capturedOn: string };
      return { capturedOn: opts.today ?? meta.capturedOn, files };
    }
    const buf = new Uint8Array(await (await fetchWithRetry(EPOCH_ZIP_URL)).arrayBuffer());
    const unzipped = unzipSync(buf, { filter: (f) => f.name.toLowerCase().endsWith('.csv') });
    const files: Record<string, string> = {};
    for (const [name, data] of Object.entries(unzipped)) files[path.basename(name)] = strFromU8(data);
    return { capturedOn: opts.today ?? todayUtc(), files };
  },

  parse: parseEpoch,
};
