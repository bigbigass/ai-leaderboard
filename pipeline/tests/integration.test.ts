/**
 * End-to-end pipeline against a real Postgres. Runs only when TEST_DATABASE_URL points at a
 * disposable database (CI provides one); it TRUNCATES every table.
 */
import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_DIR } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('pipeline integration (Postgres)', () => {
  let db: import('@ail/db').Db;
  let mod: typeof import('@ail/db');
  let run: typeof import('../run');
  let q: typeof import('@ail/db/queries');
  let sql: typeof import('drizzle-orm').sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    mod = await import('@ail/db');
    run = await import('../run');
    q = await import('@ail/db/queries');
    sql = (await import('drizzle-orm')).sql;
    db = mod.getDb({ max: 2 });
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(db, { migrationsFolder: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages/db/migrations') });
    await db.execute(sql`TRUNCATE vendors, models, model_aliases, sources, leaderboards, snapshots, leaderboard_entries, model_meta,
      model_summaries, model_history, match_review_queue, pipeline_runs RESTART IDENTITY CASCADE`);
  }, 60_000);

  afterAll(async () => {
    await mod?.closeDb();
  });

  const silent = () => {};

  it('seeds the fixture: LMArena full history + Epoch + OpenRouter', async () => {
    const s = await run.runPipeline(db, { mode: 'full', runMode: 'seed', fixtureDir: SEED_DIR, log: silent });
    expect(s.ok).toBe(true);
    expect(s.results.map((r) => r.source).sort()).toEqual(['epoch', 'lmarena', 'openrouter']);
    const models = await q.getModelList(db);
    expect(models.length).toBe(30);
    expect(models.filter((m) => m.country === 'CN').length).toBeGreaterThanOrEqual(10);
    expect(models.filter((m) => m.price).length).toBeGreaterThan(20);
    const boards = await q.getBoards(db);
    expect(boards.length).toBe(12);
    const table = await q.getBoardTable(db, 'lmarena', 'text-overall');
    expect(table!.historyDates.length).toBe(7); // full-history backfill
  }, 120_000);

  it('never publishes unmatched rows; fuzzy suggestions stay in the review queue', async () => {
    const table = await q.getBoardTable(db, 'lmarena', 'text-overall');
    expect(table!.rows.some((r) => r.rawName === 'qwen3-235b-a22b-instruct-2507')).toBe(false);
    const [stored] = (await db.execute(sql`SELECT count(*)::int AS n FROM leaderboard_entries WHERE raw_name = 'qwen3-235b-a22b-instruct-2507' AND model_id IS NULL`)) as unknown as { n: number }[];
    expect(stored!.n).toBeGreaterThan(0);
    const queue = (await db.execute(sql`SELECT raw_name, suggested_model_slug FROM match_review_queue WHERE status = 'pending' ORDER BY raw_name`)) as unknown as { raw_name: string; suggested_model_slug: string | null }[];
    expect(queue).toContainEqual({ raw_name: 'qwen3-235b-a22b-instruct-2507', suggested_model_slug: 'qwen3-235b-a22b' });
  });

  it('is idempotent: re-running the same data inserts no snapshots', async () => {
    const s = await run.runPipeline(db, { mode: 'full', runMode: 'run', fixtureDir: SEED_DIR, log: silent });
    const lm = s.results.find((r) => r.source === 'lmarena')!;
    expect(lm.stats).toMatchObject({ snapshotsInserted: 0 });
    const ep = s.results.find((r) => r.source === 'epoch')!;
    expect(ep.stats).toMatchObject({ snapshotsInserted: 0 });
  }, 120_000);

  it('rejects a critical batch (row count drop) and keeps the last good snapshot live', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ail-fixture-'));
    await mkdir(path.join(dir, 'epoch'));
    await cp(path.join(SEED_DIR, 'epoch'), path.join(dir, 'epoch'), { recursive: true });
    await cp(path.join(SEED_DIR, 'openrouter.json'), path.join(dir, 'openrouter.json'));
    const raw = JSON.parse(await readFile(path.join(SEED_DIR, 'lmarena.json'), 'utf8')) as { configs: { config: string; rows: Record<string, unknown>[] }[] };
    const text = raw.configs.find((c) => c.config === 'text')!;
    const overall = text.rows.filter((r) => r.category === 'overall' && r.leaderboard_publish_date === '2025-09-30');
    const broken = overall.slice(0, 5).map((r) => ({ ...r, leaderboard_publish_date: '2025-10-07' }));
    await writeFile(path.join(dir, 'lmarena.json'), JSON.stringify({ configs: [{ config: 'text', split: 'latest', rows: broken }] }));

    const s = await run.runPipeline(db, { mode: 'latest', runMode: 'run', only: ['lmarena'], fixtureDir: dir, log: silent });
    const lm = s.results[0]!;
    expect(lm.status).toBe('warn');
    expect(lm.stats).toMatchObject({ snapshotsRejected: 1 });
    expect(lm.warnings.join('\n')).toMatch(/REJECTED .*row count dropped/);
    const table = await q.getBoardTable(db, 'lmarena', 'text-overall');
    expect(table!.publishedAt).toBe('2025-09-30');
    expect(table!.historyDates).not.toContain('2025-10-07');
  }, 120_000);

  it('a schema mismatch fails the source and writes nothing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ail-fixture-'));
    await writeFile(path.join(dir, 'lmarena.json'), JSON.stringify({ configs: [{ config: 'text', split: 'latest', rows: [{ model: 'x', elo: 1 }] }] }));
    const before = (await db.execute(sql`SELECT count(*)::int AS n FROM snapshots`)) as unknown as { n: number }[];
    const s = await run.runPipeline(db, { mode: 'latest', runMode: 'run', only: ['lmarena'], fixtureDir: dir, log: silent });
    expect(s.ok).toBe(false);
    expect(s.results[0]!.error).toMatch(/schema mismatch/);
    const after = (await db.execute(sql`SELECT count(*)::int AS n FROM snapshots`)) as unknown as { n: number }[];
    expect(after[0]!.n).toBe(before[0]!.n);
  }, 60_000);

  it('disabled sources are hidden from published queries', async () => {
    const srcs = await q.getEnabledSources(db);
    expect(srcs.map((x) => x.slug).sort()).toEqual(['epoch', 'lmarena', 'openrouter']);
  });
});
