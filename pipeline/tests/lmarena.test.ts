import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeParquet, lmarenaAdapter, parseLmarena, type LmarenaRaw } from '../adapters/lmarena';
import { SchemaMismatchError } from '../types';
import { FIXTURES, SEED_DIR } from './helpers';

const row = (o: Record<string, unknown> = {}) => ({
  model_name: 'deepseek-v3-0324',
  organization: 'DeepSeek',
  license: 'MIT',
  rating: 1390.4,
  rating_lower: 1384,
  rating_upper: 1396,
  vote_count: 12000,
  rank: 7,
  category: 'overall',
  leaderboard_publish_date: '2025-09-30',
  ...o,
});

describe('LMArena parser', () => {
  it('maps a row to a normalized score with board, category and CI', () => {
    const [s] = parseLmarena({ configs: [{ config: 'text', split: 'latest', rows: [row()] }] });
    expect(s).toMatchObject({
      source: 'lmarena',
      publishedAt: '2025-09-30',
      rawName: 'deepseek-v3-0324',
      rank: 7,
      score: 1390.4,
      scoreLower: 1384,
      scoreUpper: 1396,
      votes: 12000,
      redistributable: true,
      leaderboard: { boardKey: 'text-overall', category: 'overall', scoreType: 'elo', categoryMapped: true },
    });
  });

  it('maps categories per config and slugs board keys', () => {
    const out = parseLmarena({
      configs: [
        { config: 'text', split: 'full', rows: [row({ category: 'hard_prompts' }), row({ category: 'Chinese' })] },
        { config: 'webdev', split: 'full', rows: [row()] },
        { config: 'vision', split: 'full', rows: [row()] },
        { config: 'text', split: 'full', rows: [row({ category: 'brand_new_category' })] },
      ],
    });
    expect(out.map((s) => [s.leaderboard.boardKey, s.leaderboard.category, s.leaderboard.categoryMapped])).toEqual([
      ['text-hard-prompts', 'reasoning', true],
      ['text-chinese', 'chinese', true],
      ['webdev-overall', 'coding', true],
      ['vision-overall', 'vision', true],
      ['text-brand-new-category', 'other', false],
    ]);
  });

  it('accepts parquet-style dates (Date objects, epoch days)', () => {
    const out = parseLmarena({
      configs: [{ config: 'text', split: 'full', rows: [row({ leaderboard_publish_date: new Date('2025-08-05T00:00:00Z') }), row({ leaderboard_publish_date: 20305 })] }],
    });
    expect(out.map((s) => s.publishedAt)).toEqual(['2025-08-05', '2025-08-05']);
  });

  it('raises SchemaMismatchError when a required column is missing', () => {
    const bad = { ...row() } as Record<string, unknown>;
    delete bad.model_name;
    expect(() => parseLmarena({ configs: [{ config: 'text', split: 'full', rows: [bad] }] })).toThrow(SchemaMismatchError);
    expect(() => parseLmarena({ configs: [{ config: 'text', split: 'full', rows: [row({ leaderboard_publish_date: 'soon' })] }] })).toThrow(SchemaMismatchError);
  });

  it('decodes the official parquet layout', async () => {
    const buf = await readFile(path.join(FIXTURES, 'lmarena-sample.parquet'));
    const rows = await decodeParquet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(rows).toHaveLength(8);
    const parsed = parseLmarena({ configs: [{ config: 'text', split: 'latest', rows }] });
    expect(parsed[0]!.leaderboard.boardKey).toBe('text-overall');
    expect(parsed.every((p) => p.publishedAt === '2025-09-30' && typeof p.score === 'number')).toBe(true);
  });

  it('full mode keeps every publish date (backfill); latest mode only the newest', async () => {
    const full = (await lmarenaAdapter.fetch({ mode: 'full', fixtureDir: SEED_DIR })) as LmarenaRaw;
    const latest = (await lmarenaAdapter.fetch({ mode: 'latest', fixtureDir: SEED_DIR })) as LmarenaRaw;
    const dates = (raw: LmarenaRaw) => new Set(parseLmarena(raw).map((s) => s.publishedAt));
    expect(dates(full).size).toBeGreaterThan(5);
    expect([...dates(latest)]).toEqual(['2025-09-30']);
  });
});
