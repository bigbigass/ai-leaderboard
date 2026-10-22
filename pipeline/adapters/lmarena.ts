import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parquetReadObjects } from 'hyparquet';
import { z } from 'zod';
import { mapCategory, slugPart } from '../categories';
import { SchemaMismatchError, type NormalizedScore, type ScoreAdapter } from '../types';
import { fetchWithRetry, toInt, toIsoDate, toNum, toStr } from './base';

export const LMARENA_DATASET = 'lmarena-ai/leaderboard-dataset';
const HF = 'https://huggingface.co';

export interface LmarenaConfigRows {
  config: string;
  split: string;
  rows: Record<string, unknown>[];
}
export interface LmarenaRaw {
  configs: LmarenaConfigRows[];
}

/** Columns we rely on. Extra columns are ignored; missing required ones = schema mismatch. */
const rowSchema = z.object({
  model_name: z.string().min(1),
  organization: z.unknown().optional(),
  license: z.unknown().optional(),
  rating: z.unknown(),
  rating_lower: z.unknown().optional(),
  rating_upper: z.unknown().optional(),
  vote_count: z.unknown().optional(),
  rank: z.unknown().optional(),
  category: z.string().min(1),
  leaderboard_publish_date: z.unknown(),
});

const CONFIG_LABEL: Record<string, string> = {
  text: 'Text',
  text_style_control: 'Text (style control)',
  vision: 'Vision',
  webdev: 'WebDev',
  search: 'Search',
  agent: 'Agent',
};

function titleCase(s: string): string {
  return s
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

export async function decodeParquet(buf: ArrayBuffer): Promise<Record<string, unknown>[]> {
  return (await parquetReadObjects({ file: buf })) as Record<string, unknown>[];
}

export function parseLmarena(raw: LmarenaRaw): NormalizedScore[] {
  const out: NormalizedScore[] = [];
  for (const cfg of raw.configs) {
    const baseConfig = cfg.config.replace(/_style_control$/, '');
    const styleControl = cfg.config.endsWith('_style_control');
    for (const [i, r] of cfg.rows.entries()) {
      const parsed = rowSchema.safeParse(r);
      if (!parsed.success) {
        throw new SchemaMismatchError('lmarena', `config ${cfg.config} row ${i}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
      }
      const row = parsed.data;
      const publishedAt = toIsoDate(row.leaderboard_publish_date);
      if (!publishedAt) throw new SchemaMismatchError('lmarena', `config ${cfg.config} row ${i}: bad leaderboard_publish_date`);
      const catRaw = row.category.trim().toLowerCase();
      const { category, mapped } = mapCategory(`lmarena:${baseConfig}:${catRaw}`);
      const boardKey = slugPart(`${cfg.config}-${catRaw}`);
      out.push({
        source: 'lmarena',
        leaderboard: {
          boardKey,
          name: `LMArena ${CONFIG_LABEL[cfg.config] ?? titleCase(cfg.config)} · ${titleCase(catRaw)}`,
          category,
          categoryRaw: `${cfg.config}:${catRaw}`,
          scoreType: 'elo',
          higherIsBetter: true,
          externalUrl: `https://lmarena.ai/leaderboard/${baseConfig}`,
          categoryMapped: mapped,
        },
        publishedAt,
        batchKey: null,
        rawName: row.model_name.trim(),
        rawOrg: toStr(row.organization),
        rank: toInt(row.rank),
        score: toNum(row.rating),
        scoreLower: toNum(row.rating_lower),
        scoreUpper: toNum(row.rating_upper),
        votes: toInt(row.vote_count),
        redistributable: true,
        extra: { license: toStr(row.license), styleControl },
      });
    }
  }
  return out;
}

/** Keep only the newest publish date per config (what the `latest` split contains). */
function onlyLatest(raw: LmarenaRaw): LmarenaRaw {
  return {
    configs: raw.configs.map((c) => {
      const dates = c.rows.map((r) => toIsoDate(r.leaderboard_publish_date) ?? '');
      const max = dates.reduce((a, b) => (b > a ? b : a), '');
      return { ...c, split: 'latest', rows: c.rows.filter((_, i) => dates[i] === max) };
    }),
  };
}

export const lmarenaAdapter: ScoreAdapter<LmarenaRaw> = {
  id: 'lmarena',
  name: 'LMArena',
  url: 'https://lmarena.ai/leaderboard',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'LMArena leaderboard data (lmarena-ai/leaderboard-dataset on Hugging Face), CC BY 4.0.',
  kind: 'scores',

  async fetch(opts) {
    if (opts.fixtureDir) {
      const raw = JSON.parse(await readFile(path.join(opts.fixtureDir, 'lmarena.json'), 'utf8')) as LmarenaRaw;
      return opts.mode === 'full' ? raw : onlyLatest(raw);
    }
    // { [config]: { [split]: string[] } } — lists the auto-converted parquet shards per config/split.
    const listing = (await (await fetchWithRetry(`${HF}/api/datasets/${LMARENA_DATASET}/parquet`)).json()) as Record<
      string,
      Record<string, string[]>
    >;
    const configs: LmarenaConfigRows[] = [];
    for (const [config, splits] of Object.entries(listing)) {
      const split = opts.mode === 'full' ? (splits.full ? 'full' : 'latest') : splits.latest ? 'latest' : 'full';
      const urls = splits[split];
      if (!urls?.length) continue;
      const rows: Record<string, unknown>[] = [];
      for (const url of urls) {
        const buf = await (await fetchWithRetry(url)).arrayBuffer();
        rows.push(...(await decodeParquet(buf)));
      }
      configs.push({ config, split, rows });
    }
    if (configs.length === 0) throw new SchemaMismatchError('lmarena', 'no parquet configs listed');
    const raw = { configs };
    // When only a `full` split exists, a daily run still only needs the newest date.
    return opts.mode === 'full' ? raw : onlyLatest(raw);
  },

  parse: parseLmarena,
};
