import { describe, expect, it } from 'vitest';
import { epochAdapter, isEpochOwnRow, parseEpoch } from '../adapters/epoch';
import { SchemaMismatchError } from '../types';
import { SEED_DIR } from './helpers';

const csv = (rows: string[]) => ['Model version,Best score (across scorers),Organization,Stderr,Source,Source link', ...rows].join('\n');

describe('Epoch parser', () => {
  it('converts 0–1 accuracy to percent, ranks by score and keeps the best run per model', () => {
    const out = parseEpoch({
      capturedOn: '2025-09-30',
      files: { 'gpqa_diamond.csv': csv(['model-a,0.5,Lab,0.03,Epoch AI,https://epoch.ai', 'model-b,0.8,Lab,,Epoch AI,', 'model-a,0.6,Lab,,Epoch AI,']) },
    });
    expect(out.map((s) => [s.rawName, s.score, s.rank])).toEqual([
      ['model-b', 80, 1],
      ['model-a', 60, 2],
    ]);
    expect(out[0]).toMatchObject({
      source: 'epoch',
      publishedAt: '2025-09-30',
      leaderboard: { boardKey: 'gpqa-diamond', category: 'knowledge', scoreType: 'percent' },
    });
  });

  it('marks third-party rows as not redistributable and keeps their original source', () => {
    const out = parseEpoch({
      capturedOn: '2025-09-30',
      files: { 'swe_bench_verified.csv': csv(['own,0.7,Lab,,Epoch AI,', 'ext,0.6,Lab,,SWE-bench (external),https://www.swebench.com']) },
    });
    const ext = out.find((s) => s.rawName === 'ext')!;
    expect(ext.redistributable).toBe(false);
    expect(ext.extra).toMatchObject({ originalSource: 'SWE-bench (external)', sourceLink: 'https://www.swebench.com' });
    expect(out.find((s) => s.rawName === 'own')!.redistributable).toBe(true);
    expect(isEpochOwnRow('Epoch AI')).toBe(true);
    expect(isEpochOwnRow('LiveBench')).toBe(false);
  });

  it('gives ties the same rank', () => {
    const out = parseEpoch({ capturedOn: '2025-09-30', files: { 'frontiermath.csv': csv(['a,0.2,L,,Epoch AI,', 'b,0.2,L,,Epoch AI,', 'c,0.1,L,,Epoch AI,']) } });
    expect(out.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it('raises SchemaMismatchError on missing columns or no known files', () => {
    expect(() => parseEpoch({ capturedOn: '2025-09-30', files: { 'gpqa_diamond.csv': 'name,value\nx,1' } })).toThrow(SchemaMismatchError);
    expect(() => parseEpoch({ capturedOn: '2025-09-30', files: { 'unknown.csv': csv([]) } })).toThrow(SchemaMismatchError);
  });

  it('parses the committed seed fixture (4 benchmarks)', async () => {
    const out = epochAdapter.parse(await epochAdapter.fetch({ mode: 'latest', fixtureDir: SEED_DIR }));
    expect(new Set(out.map((s) => s.leaderboard.boardKey))).toEqual(new Set(['gpqa-diamond', 'frontiermath', 'otis-mock-aime', 'swe-bench-verified']));
    expect(out.some((s) => !s.redistributable)).toBe(true);
  });
});
