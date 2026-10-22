import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { livebenchAdapter, parseLivebench } from '../adapters/livebench';
import { allSources, enabledAdapters, SOURCES_CONFIG } from '../sources.config';
import { NotEnabledError } from '../types';
import { REPO_ROOT } from './helpers';

describe('sources.config', () => {
  it('enables exactly LMArena, Epoch AI and OpenRouter', () => {
    expect(enabledAdapters().map((a) => a.id).sort()).toEqual(['epoch', 'lmarena', 'openrouter']);
  });

  it('gates LiveBench, OpenCompass and SuperCLUE off, and their fetch refuses to run', async () => {
    const off = SOURCES_CONFIG.filter((s) => !s.enabled).map((s) => s.adapter);
    expect(off.map((a) => a.id).sort()).toEqual(['livebench', 'opencompass', 'superclue']);
    for (const a of off) await expect(a.fetch({ mode: 'latest' })).rejects.toBeInstanceOf(NotEnabledError);
  });

  it('LiveBench parser works for when the license is confirmed', () => {
    const out = parseLivebench({ releaseDate: '2025-05-30', publishedAt: '2025-06-01', csv: 'model,global_average,coding\na,70,60\nb,80,50' });
    expect(out.filter((s) => s.leaderboard.boardKey === 'global-average').map((s) => [s.rawName, s.rank])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
    expect(out[0]!.batchKey).toBe('2025-05-30');
    expect(livebenchAdapter.kind).toBe('scores');
  });

  it('declares license + attribution for every enabled source', () => {
    for (const s of allSources().filter((x) => x.enabled)) {
      expect(s.license.length).toBeGreaterThan(3);
      expect(s.attribution.length).toBeGreaterThan(10);
    }
    expect(allSources().find((s) => s.id === 'epoch')!.attribution).toMatch(/Epoch AI/);
  });

  it('contains no Artificial Analysis code anywhere in the codebase', async () => {
    const dirs = ['pipeline', 'packages/db/src', 'apps/web/src', '.github'];
    const offenders: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (['node_modules', 'out', 'tests', '.next'].includes(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (/\.(ts|tsx|js|mjs|ya?ml|json)$/.test(e.name) && /artificial[\s_-]*analysis|artificialanalysis/i.test(await readFile(p, 'utf8'))) offenders.push(p);
      }
    };
    for (const d of dirs) await walk(path.join(REPO_ROOT, d)).catch(() => undefined);
    // sources.config.ts mentions it only in a comment forbidding it.
    expect(offenders.map((p) => path.relative(REPO_ROOT, p))).toEqual(['pipeline/sources.config.ts']);
    const cfg = await readFile(path.join(REPO_ROOT, 'pipeline/sources.config.ts'), 'utf8');
    expect(cfg.split('\n').filter((l) => /artificial/i.test(l)).every((l) => l.trim().startsWith('*') || l.trim().startsWith('//'))).toBe(true);
    expect(SOURCES_CONFIG.some((s) => /artificial/i.test(s.adapter.id + s.adapter.name))).toBe(false);
  });
});
