#!/usr/bin/env tsx
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb, hasDatabaseUrl } from '@ail/db';
import { runCompute } from './compute/index';
import { allSources } from './sources.config';
import { pendingReview, REVIEW_JSON } from './store/review';
import { rematch, runPipeline } from './run';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SEED_DIR = path.resolve(HERE, '../packages/db/seed');

const HELP = `Usage: pnpm pipeline <command> [options]

Commands:
  run [--source <id>]... [--fixtures <dir>]   fetch → parse → match → validate → compute → write (enabled sources)
  backfill lmarena [--fixtures <dir>]         ingest the complete LMArena history (all publish dates)
  compute                                     recompute model_history + model_summaries
  rematch                                     re-apply aliases.yaml to stored unmatched rows (no fetch)
  review                                      print the match review queue (approve by editing data/aliases.yaml)
  sources                                     list sources and their enabled flag
  seed                                        load the committed fixture (packages/db/seed) — no network
`;

function flagValues(args: string[], name: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => {
    if (a === name && args[i + 1]) out.push(args[i + 1]!);
    else if (a.startsWith(`${name}=`)) out.push(a.slice(name.length + 1));
  });
  return out;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(HELP);
    return 0;
  }
  if (cmd === 'sources') {
    for (const s of allSources()) console.log(`${s.enabled ? '✔' : '✘'} ${s.id.padEnd(12)} ${s.kind.padEnd(9)} ${s.license}`);
    return 0;
  }
  if (!hasDatabaseUrl()) {
    console.error('DATABASE_URL is not set');
    return 1;
  }
  const db = getDb({ max: 3 });
  const fixtures = flagValues(args, '--fixtures')[0];
  const fixtureDir = fixtures ? path.resolve(process.env.INIT_CWD ?? process.cwd(), fixtures) : undefined;
  try {
    switch (cmd) {
      case 'run': {
        const summary = await runPipeline(db, { mode: 'latest', runMode: 'run', only: flagValues(args, '--source'), fixtureDir });
        return summary.ok ? 0 : 1;
      }
      case 'backfill': {
        const source = args.find((a) => !a.startsWith('--') && a !== fixtures) ?? 'lmarena';
        if (source !== 'lmarena') {
          console.error('only `backfill lmarena` is supported (other sources publish no history)');
          return 1;
        }
        const summary = await runPipeline(db, { mode: 'full', runMode: 'backfill', only: ['lmarena'], fixtureDir });
        return summary.ok ? 0 : 1;
      }
      case 'seed': {
        const summary = await runPipeline(db, { mode: 'full', runMode: 'seed', fixtureDir: SEED_DIR });
        return summary.ok ? 0 : 1;
      }
      case 'compute':
        console.log(JSON.stringify(await runCompute(db)));
        return 0;
      case 'rematch':
        await rematch(db);
        return 0;
      case 'review': {
        const items = await pendingReview(db);
        if (!items.length) console.log('review queue is empty');
        for (const it of items) {
          const sug = it.suggestedModelSlug ? `→ ${it.suggestedModelSlug} (${it.suggestionScore})` : '(no suggestion)';
          console.log(`${it.sourceSlug.padEnd(11)} ${it.rawName.padEnd(48)} ${sug}  ×${it.occurrences}`);
        }
        console.log(`\n${items.length} pending. Approve by adding aliases to pipeline/data/aliases.yaml, then \`pnpm pipeline rematch\`. JSON: ${REVIEW_JSON}`);
        return 0;
      }
      default:
        console.error(`unknown command "${cmd}"\n\n${HELP}`);
        return 1;
    }
  } finally {
    await closeDb();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
