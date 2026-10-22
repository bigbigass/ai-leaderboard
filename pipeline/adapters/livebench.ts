import Papa from 'papaparse';
import { mapCategory } from '../categories';
import { NotEnabledError, SchemaMismatchError, type NormalizedScore, type ScoreAdapter } from '../types';
import { toNum, toStr } from './base';

/**
 * LiveBench — DISABLED (enabled=false in sources.config.ts) until the license for republishing
 * results is confirmed. fetch() refuses to run; parse() is kept for when it is enabled.
 */
export interface LivebenchRaw {
  releaseDate: string; // LiveBench question-set release → batch_key
  publishedAt: string;
  csv: string; // columns: model, global_average, coding, reasoning, mathematics, ...
}

const BOARDS = ['global_average', 'coding', 'reasoning', 'mathematics'] as const;

export function parseLivebench(raw: LivebenchRaw): NormalizedScore[] {
  const parsed = Papa.parse<Record<string, string>>(raw.csv, { header: true, skipEmptyLines: true });
  const header = parsed.meta.fields ?? [];
  if (!header.includes('model')) throw new SchemaMismatchError('livebench', 'missing model column');
  const out: NormalizedScore[] = [];
  for (const board of BOARDS) {
    if (!header.includes(board)) continue;
    const rows = parsed.data
      .map((r) => ({ name: toStr(r.model), score: toNum(r[board]) }))
      .filter((r): r is { name: string; score: number } => r.name != null && r.score != null)
      .sort((a, b) => b.score - a.score);
    const { category, mapped } = mapCategory(`livebench:${board}`);
    rows.forEach((r, i) =>
      out.push({
        source: 'livebench',
        leaderboard: {
          boardKey: board.replace(/_/g, '-'),
          name: `LiveBench · ${board.replace(/_/g, ' ')}`,
          category,
          categoryRaw: board,
          scoreType: 'percent',
          higherIsBetter: true,
          externalUrl: 'https://livebench.ai',
          categoryMapped: mapped,
        },
        publishedAt: raw.publishedAt,
        batchKey: raw.releaseDate,
        rawName: r.name,
        rawOrg: null,
        rank: i + 1,
        score: r.score,
        scoreLower: null,
        scoreUpper: null,
        votes: null,
        redistributable: true,
        extra: null,
      }),
    );
  }
  return out;
}

export const livebenchAdapter: ScoreAdapter<LivebenchRaw> = {
  id: 'livebench',
  name: 'LiveBench',
  url: 'https://livebench.ai',
  license: 'Unconfirmed — disabled',
  licenseUrl: null,
  attribution: 'LiveBench',
  kind: 'scores',
  async fetch() {
    throw new NotEnabledError('livebench');
  },
  parse: parseLivebench,
};
