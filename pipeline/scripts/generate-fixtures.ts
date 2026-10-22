/**
 * Generates the committed offline fixtures (deterministic; re-run with `pnpm --filter @ail/pipeline exec tsx scripts/generate-fixtures.ts`):
 *   packages/db/seed/lmarena.json         raw LMArena rows (text / vision / webdev, 7 publish dates)
 *   packages/db/seed/epoch/*.csv           Epoch benchmark CSVs (+ _meta.json capture date)
 *   packages/db/seed/openrouter.json       OpenRouter /api/v1/models payload
 *   pipeline/tests/fixtures/lmarena-sample.parquet  small parquet file for the decoder test
 *
 * VALUES ARE ILLUSTRATIVE, NOT AUTHORITATIVE. They exist so the site builds and renders with no
 * network; real numbers come from `pnpm pipeline backfill lmarena` + `pnpm pipeline run`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parquetWriteBuffer } from 'hyparquet-writer';
import Papa from 'papaparse';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(HERE, '../../packages/db/seed');
const TEST_FIX = path.resolve(HERE, '../tests/fixtures');

// Deterministic PRNG (mulberry32) so fixture diffs are reviewable.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20251022);
const noise = (amp: number) => Math.round((rand() * 2 - 1) * amp);

const DATES = ['2025-05-06', '2025-06-03', '2025-07-01', '2025-08-05', '2025-09-02', '2025-09-23', '2025-09-30'];
const TEXT_CATS = ['overall', 'coding', 'math', 'chinese', 'hard_prompts', 'creative_writing'] as const;
type TextCat = (typeof TEXT_CATS)[number];

interface M {
  raw: string;
  org: string;
  license: string;
  released: string;
  elo: number;
  off?: Partial<Record<TextCat, number>>;
  vision?: number;
  webdev?: number;
}

// raw LMArena name → strength. Offsets create cross-board disagreements on purpose.
const LM: M[] = [
  { raw: 'gemini-2.5-pro', org: 'Google', license: 'Proprietary', released: '2025-03-25', elo: 1455, off: { math: 10, coding: 4 }, vision: 1250, webdev: 1440 },
  { raw: 'gpt-5-high', org: 'OpenAI', license: 'Proprietary', released: '2025-08-07', elo: 1442, off: { math: 18, coding: 12 }, vision: 1238, webdev: 1470 },
  { raw: 'claude-opus-4-1-20250805-thinking-16k', org: 'Anthropic', license: 'Proprietary', released: '2025-08-05', elo: 1447, off: { coding: 20, creative_writing: 6 }, vision: 1215, webdev: 1480 },
  { raw: 'claude-opus-4-1-20250805', org: 'Anthropic', license: 'Proprietary', released: '2025-08-05', elo: 1438, off: { coding: 16 }, vision: 1210, webdev: 1472 },
  { raw: 'o3-2025-04-16', org: 'OpenAI', license: 'Proprietary', released: '2025-04-16', elo: 1430, off: { math: 22, hard_prompts: 10 }, vision: 1225, webdev: 1380 },
  { raw: 'grok-4-0709', org: 'xAI', license: 'Proprietary', released: '2025-07-09', elo: 1420, off: { math: -22, creative_writing: -10 }, vision: 1190, webdev: 1340 },
  { raw: 'deepseek-r1-0528', org: 'DeepSeek', license: 'MIT', released: '2025-05-28', elo: 1418, off: { math: -28, chinese: 20 }, webdev: 1400 },
  { raw: 'deepseek-v3.1-thinking', org: 'DeepSeek', license: 'MIT', released: '2025-08-21', elo: 1420, off: { chinese: 22, math: 8 } },
  { raw: 'deepseek-v3.1', org: 'DeepSeek', license: 'MIT', released: '2025-08-21', elo: 1415, off: { chinese: 24 }, webdev: 1395 },
  { raw: 'kimi-k2-0711-preview', org: 'Moonshot', license: 'Modified MIT', released: '2025-07-11', elo: 1412, off: { coding: -38, chinese: 26 }, webdev: 1390 },
  { raw: 'qwen3-235b-a22b', org: 'Alibaba', license: 'Apache 2.0', released: '2025-04-29', elo: 1410, off: { chinese: 25, math: 12 }, webdev: 1340 },
  { raw: 'qwen3-235b-a22b-no-thinking', org: 'Alibaba', license: 'Apache 2.0', released: '2025-04-29', elo: 1385, off: { chinese: 20 } },
  { raw: 'glm-4.5', org: 'Zhipu', license: 'MIT', released: '2025-07-28', elo: 1408, off: { chinese: 18, coding: 6 }, webdev: 1410 },
  { raw: 'gpt-4.1-2025-04-14', org: 'OpenAI', license: 'Proprietary', released: '2025-04-14', elo: 1405, off: { coding: 6 }, vision: 1205, webdev: 1350 },
  { raw: 'doubao-seed-1.6-thinking', org: 'ByteDance', license: 'Proprietary', released: '2025-06-11', elo: 1408, off: { chinese: 30 }, vision: 1200 },
  { raw: 'doubao-seed-1.6', org: 'ByteDance', license: 'Proprietary', released: '2025-06-11', elo: 1402, off: { chinese: 28 }, vision: 1195 },
  { raw: 'gemini-2.5-flash', org: 'Google', license: 'Proprietary', released: '2025-04-17', elo: 1400, vision: 1220, webdev: 1300 },
  { raw: 'grok-3-preview-02-24', org: 'xAI', license: 'Proprietary', released: '2025-02-17', elo: 1398 },
  { raw: 'claude-sonnet-4-20250514-thinking-32k', org: 'Anthropic', license: 'Proprietary', released: '2025-05-22', elo: 1400, off: { coding: 18 }, vision: 1198, webdev: 1425 },
  { raw: 'claude-sonnet-4-20250514', org: 'Anthropic', license: 'Proprietary', released: '2025-05-22', elo: 1395, off: { coding: 15 }, vision: 1192, webdev: 1420 },
  { raw: 'deepseek-v3-0324', org: 'DeepSeek', license: 'MIT', released: '2025-03-24', elo: 1390, off: { chinese: 22 }, webdev: 1360 },
  { raw: 'qwen3-coder-480b-a35b-instruct', org: 'Alibaba', license: 'Apache 2.0', released: '2025-07-22', elo: 1385, off: { coding: 30, creative_writing: -20 }, webdev: 1430 },
  { raw: 'mistral-medium-2505', org: 'Mistral', license: 'Proprietary', released: '2025-05-07', elo: 1380, vision: 1170, webdev: 1290 },
  { raw: 'hunyuan-turbos-20250416', org: 'Tencent', license: 'Proprietary', released: '2025-04-16', elo: 1378, off: { chinese: 26 } },
  { raw: 'minimax-m1', org: 'MiniMax', license: 'Apache 2.0', released: '2025-06-16', elo: 1375, off: { chinese: 14 }, webdev: 1330 },
  { raw: 'qwen2.5-max', org: 'Alibaba', license: 'Proprietary', released: '2025-01-28', elo: 1375, off: { chinese: 18 } },
  { raw: 'gpt-4o-2024-11-20', org: 'OpenAI', license: 'Proprietary', released: '2024-11-20', elo: 1372, off: { math: 24 }, vision: 1180 },
  { raw: 'claude-3-7-sonnet-20250219', org: 'Anthropic', license: 'Proprietary', released: '2025-02-24', elo: 1372, off: { coding: 14 }, vision: 1175, webdev: 1360 },
  { raw: 'step-3', org: 'StepFun', license: 'Apache 2.0', released: '2025-07-31', elo: 1370, off: { chinese: 16 }, vision: 1185 },
  { raw: 'ernie-4.5-300b-a47b', org: 'Baidu', license: 'Apache 2.0', released: '2025-06-30', elo: 1368, off: { chinese: 24 } },
  { raw: 'gpt-oss-120b', org: 'OpenAI', license: 'Apache 2.0', released: '2025-08-05', elo: 1360, off: { math: 16 }, webdev: 1300 },
  { raw: 'gemma-3-27b-it', org: 'Google', license: 'Gemma', released: '2025-03-12', elo: 1352, vision: 1150 },
  { raw: 'llama-4-maverick-17b-128e-instruct', org: 'Meta', license: 'Llama 4', released: '2025-04-05', elo: 1325, vision: 1140 },
  { raw: 'mistral-large-2411', org: 'Mistral', license: 'MRL', released: '2024-11-18', elo: 1320 },
  { raw: 'llama-3.1-405b-instruct-bf16', org: 'Meta', license: 'Llama 3.1', released: '2024-07-23', elo: 1318 },
  // Not in aliases.yaml → review queue (fuzzy suggestions must NOT be applied).
  { raw: 'qwen3-235b-a22b-instruct-2507', org: 'Alibaba', license: 'Apache 2.0', released: '2025-07-21', elo: 1416, off: { chinese: 22 } },
  { raw: 'glm-4.5-air', org: 'Zhipu', license: 'MIT', released: '2025-07-28', elo: 1380 },
  { raw: 'mystery-model-x', org: 'Unknown', license: 'Proprietary', released: '2025-09-25', elo: 1300 },
];

function lmarenaRows() {
  const configs: { config: string; split: string; rows: Record<string, unknown>[] }[] = [];
  const mk = (config: string, cats: readonly string[], eloOf: (m: M, cat: string) => number | undefined, dates: string[]) => {
    const rows: Record<string, unknown>[] = [];
    dates.forEach((date, di) => {
      for (const cat of cats) {
        const pool = LM.filter((m) => m.released < date)
          .map((m) => {
            const base = eloOf(m, cat);
            if (base == null) return null;
            // Newer snapshots: slight decay for old models, small per-date noise.
            const age = (Date.parse(date) - Date.parse(m.released)) / (86_400_000 * 365);
            const rating = base - Math.round(age * 6) + noise(5) - (DATES.length - 1 - di);
            const votes = Math.round((cat === 'overall' ? 9000 : 3000) * (1 + age * 2) + noise(400));
            const ci = Math.max(3, Math.round(400 / Math.sqrt(votes)));
            return { m, rating, votes, ci };
          })
          .filter((x): x is NonNullable<typeof x> => x != null)
          .sort((a, b) => b.rating - a.rating);
        let rank = 0;
        let prev = Number.NaN;
        pool.forEach((p, i) => {
          if (p.rating !== prev) rank = i + 1;
          prev = p.rating;
          rows.push({
            model_name: p.m.raw,
            organization: p.m.org,
            license: p.m.license,
            rating: p.rating,
            rating_lower: p.rating - p.ci,
            rating_upper: p.rating + p.ci,
            variance: Math.round((p.ci / 1.96) ** 2 * 100) / 100,
            vote_count: p.votes,
            rank,
            category: cat,
            leaderboard_publish_date: date,
          });
        });
      }
    });
    configs.push({ config, split: 'full', rows });
  };
  mk('text', TEXT_CATS, (m, cat) => m.elo + (m.off?.[cat as TextCat] ?? 0) + (cat === 'overall' ? 0 : noise(12)), DATES);
  mk('vision', ['overall'], (m) => m.vision, DATES.slice(-3));
  mk('webdev', ['overall'], (m) => m.webdev, DATES.slice(-3));
  return { configs };
}

// Epoch: fraction scores per benchmark (model version → score).
const EPOCH_MODELS: Record<string, { org: string; released: string }> = {
  'gpt-5-2025-08-07_high': { org: 'OpenAI', released: '2025-08-07' },
  'o3-2025-04-16_high': { org: 'OpenAI', released: '2025-04-16' },
  'gpt-4.1-2025-04-14': { org: 'OpenAI', released: '2025-04-14' },
  'gpt-4o-2024-11-20': { org: 'OpenAI', released: '2024-11-20' },
  'gpt-oss-120b_high': { org: 'OpenAI', released: '2025-08-05' },
  'claude-opus-4-1-20250805_27K': { org: 'Anthropic', released: '2025-08-05' },
  'claude-sonnet-4-20250514': { org: 'Anthropic', released: '2025-05-22' },
  'claude-3-7-sonnet-20250219': { org: 'Anthropic', released: '2025-02-24' },
  'gemini-2.5-pro': { org: 'Google DeepMind', released: '2025-06-17' },
  'gemini-2.5-flash': { org: 'Google DeepMind', released: '2025-06-17' },
  'grok-4-0709': { org: 'xAI', released: '2025-07-09' },
  'grok-3': { org: 'xAI', released: '2025-02-17' },
  'Llama-4-Maverick-17B-128E-Instruct': { org: 'Meta AI', released: '2025-04-05' },
  'Llama-3.1-405B-Instruct': { org: 'Meta AI', released: '2024-07-23' },
  'mistral-large-2411': { org: 'Mistral AI', released: '2024-11-18' },
  'DeepSeek-V3-0324': { org: 'DeepSeek', released: '2025-03-24' },
  'DeepSeek-R1-0528': { org: 'DeepSeek', released: '2025-05-28' },
  'DeepSeek-V3.1': { org: 'DeepSeek', released: '2025-08-21' },
  'Qwen3-235B-A22B': { org: 'Alibaba', released: '2025-04-29' },
  'Qwen3-Coder-480B-A35B-Instruct': { org: 'Alibaba', released: '2025-07-22' },
  'qwen-max-2025-01-25': { org: 'Alibaba', released: '2025-01-28' },
  'Kimi-K2-Instruct': { org: 'Moonshot', released: '2025-07-11' },
  'GLM-4.5': { org: 'Zhipu AI', released: '2025-07-28' },
  'MiniMax-M1-80k': { org: 'MiniMax', released: '2025-06-16' },
  'claude-3-5-sonnet-20241022': { org: 'Anthropic', released: '2024-10-22' }, // not aliased → review queue
};
const EPOCH: Record<string, Record<string, number>> = {
  gpqa_diamond: {
    'gpt-5-2025-08-07_high': 0.85, 'o3-2025-04-16_high': 0.82, 'gpt-4.1-2025-04-14': 0.66, 'gpt-4o-2024-11-20': 0.49,
    'gpt-oss-120b_high': 0.78, 'claude-opus-4-1-20250805_27K': 0.8, 'claude-sonnet-4-20250514': 0.75,
    'claude-3-7-sonnet-20250219': 0.68, 'gemini-2.5-pro': 0.84, 'gemini-2.5-flash': 0.78, 'grok-4-0709': 0.87, 'grok-3': 0.75,
    'Llama-4-Maverick-17B-128E-Instruct': 0.67, 'Llama-3.1-405B-Instruct': 0.49, 'mistral-large-2411': 0.48,
    'DeepSeek-V3-0324': 0.66, 'DeepSeek-R1-0528': 0.81, 'DeepSeek-V3.1': 0.78, 'Qwen3-235B-A22B': 0.7,
    'Qwen3-Coder-480B-A35B-Instruct': 0.6, 'qwen-max-2025-01-25': 0.59, 'Kimi-K2-Instruct': 0.75, 'GLM-4.5': 0.79,
    'MiniMax-M1-80k': 0.69, 'claude-3-5-sonnet-20241022': 0.58,
  },
  frontiermath: {
    'gpt-5-2025-08-07_high': 0.25, 'o3-2025-04-16_high': 0.19, 'gpt-4.1-2025-04-14': 0.04, 'gpt-4o-2024-11-20': 0.01,
    'gpt-oss-120b_high': 0.1, 'claude-opus-4-1-20250805_27K': 0.07, 'claude-sonnet-4-20250514': 0.05,
    'claude-3-7-sonnet-20250219': 0.04, 'gemini-2.5-pro': 0.14, 'gemini-2.5-flash': 0.08, 'grok-4-0709': 0.21, 'grok-3': 0.03,
    'Llama-4-Maverick-17B-128E-Instruct': 0.01, 'DeepSeek-R1-0528': 0.08, 'DeepSeek-V3.1': 0.06, 'DeepSeek-V3-0324': 0.03,
    'Qwen3-235B-A22B': 0.05, 'Kimi-K2-Instruct': 0.03, 'GLM-4.5': 0.04, 'MiniMax-M1-80k': 0.03,
  },
  otis_mock_aime: {
    'gpt-5-2025-08-07_high': 0.91, 'o3-2025-04-16_high': 0.84, 'gpt-4.1-2025-04-14': 0.38, 'gpt-4o-2024-11-20': 0.1,
    'gpt-oss-120b_high': 0.85, 'claude-opus-4-1-20250805_27K': 0.7, 'claude-sonnet-4-20250514': 0.55,
    'claude-3-7-sonnet-20250219': 0.45, 'gemini-2.5-pro': 0.84, 'gemini-2.5-flash': 0.7, 'grok-4-0709': 0.9, 'grok-3': 0.5,
    'Llama-4-Maverick-17B-128E-Instruct': 0.25, 'DeepSeek-R1-0528': 0.82, 'DeepSeek-V3.1': 0.7, 'DeepSeek-V3-0324': 0.45,
    'Qwen3-235B-A22B': 0.78, 'qwen-max-2025-01-25': 0.3, 'Kimi-K2-Instruct': 0.55, 'GLM-4.5': 0.76, 'MiniMax-M1-80k': 0.74,
  },
  swe_bench_verified: {
    'gpt-5-2025-08-07_high': 0.72, 'o3-2025-04-16_high': 0.67, 'gpt-4.1-2025-04-14': 0.52, 'gpt-4o-2024-11-20': 0.3,
    'gpt-oss-120b_high': 0.55, 'claude-opus-4-1-20250805_27K': 0.74, 'claude-sonnet-4-20250514': 0.72,
    'claude-3-7-sonnet-20250219': 0.62, 'gemini-2.5-pro': 0.6, 'gemini-2.5-flash': 0.45, 'grok-4-0709': 0.58,
    'Llama-4-Maverick-17B-128E-Instruct': 0.2, 'DeepSeek-R1-0528': 0.57, 'DeepSeek-V3.1': 0.64, 'DeepSeek-V3-0324': 0.38,
    'Qwen3-235B-A22B': 0.45, 'Qwen3-Coder-480B-A35B-Instruct': 0.67, 'Kimi-K2-Instruct': 0.65, 'GLM-4.5': 0.64, 'MiniMax-M1-80k': 0.55,
  },
};
// Rows republished by Epoch from third parties (keep their own license → redistributable=false).
const EXTERNAL = new Set(['swe_bench_verified|claude-3-7-sonnet-20250219']);

function epochCsv(bench: string): string {
  const rows = Object.entries(EPOCH[bench]!).map(([name, score]) => {
    const meta = EPOCH_MODELS[name]!;
    const ext = EXTERNAL.has(`${bench}|${name}`);
    return {
      'Model version': name,
      'Best score (across scorers)': score,
      'Release date': meta.released,
      Organization: meta.org,
      Country: ['DeepSeek', 'Alibaba', 'Moonshot', 'Zhipu AI', 'MiniMax'].includes(meta.org) ? 'China' : 'United States of America',
      Stderr: Math.round(Math.sqrt((score * (1 - score)) / 198) * 1000) / 1000,
      Source: ext ? 'SWE-bench (external leaderboard)' : 'Epoch AI',
      'Source link': ext ? 'https://www.swebench.com' : 'https://epoch.ai/benchmarks',
    };
  });
  // A duplicate, worse run for one model: the parser keeps the best.
  if (bench === 'gpqa_diamond') rows.push({ ...rows[0]!, 'Best score (across scorers)': 0.7 });
  return Papa.unparse(rows) + '\n';
}

const OR_PRICES: [string, string, number, number, number, string[]][] = [
  ['openai/gpt-5', 'OpenAI: GPT-5', 1.25, 10, 400000, ['text', 'image']],
  ['openai/o3', 'OpenAI: o3', 2, 8, 200000, ['text', 'image']],
  ['openai/gpt-4.1', 'OpenAI: GPT-4.1', 2, 8, 1047576, ['text', 'image']],
  ['openai/gpt-4o-2024-11-20', 'OpenAI: GPT-4o (2024-11-20)', 2.5, 10, 128000, ['text', 'image']],
  ['openai/gpt-oss-120b', 'OpenAI: gpt-oss-120b', 0.1, 0.5, 131072, ['text']],
  ['anthropic/claude-opus-4.1', 'Anthropic: Claude Opus 4.1', 15, 75, 200000, ['text', 'image']],
  ['anthropic/claude-sonnet-4', 'Anthropic: Claude Sonnet 4', 3, 15, 1000000, ['text', 'image']],
  ['anthropic/claude-3.7-sonnet', 'Anthropic: Claude 3.7 Sonnet', 3, 15, 200000, ['text', 'image']],
  ['google/gemini-2.5-pro', 'Google: Gemini 2.5 Pro', 1.25, 10, 1048576, ['text', 'image', 'audio']],
  ['google/gemini-2.5-flash', 'Google: Gemini 2.5 Flash', 0.3, 2.5, 1048576, ['text', 'image', 'audio']],
  ['google/gemma-3-27b-it', 'Google: Gemma 3 27B', 0.09, 0.17, 131072, ['text', 'image']],
  ['x-ai/grok-4', 'xAI: Grok 4', 3, 15, 256000, ['text', 'image']],
  ['x-ai/grok-3', 'xAI: Grok 3', 3, 15, 131072, ['text']],
  ['meta-llama/llama-4-maverick', 'Meta: Llama 4 Maverick', 0.15, 0.6, 1048576, ['text', 'image']],
  ['meta-llama/llama-3.1-405b-instruct', 'Meta: Llama 3.1 405B Instruct', 0.8, 0.8, 32768, ['text']],
  ['mistralai/mistral-medium-3', 'Mistral: Mistral Medium 3', 0.4, 2, 131072, ['text', 'image']],
  ['deepseek/deepseek-chat-v3-0324', 'DeepSeek: DeepSeek V3 0324', 0.25, 0.85, 163840, ['text']],
  ['deepseek/deepseek-r1-0528', 'DeepSeek: R1 0528', 0.5, 2.15, 163840, ['text']],
  ['deepseek/deepseek-chat-v3.1', 'DeepSeek: DeepSeek V3.1', 0.25, 1, 163840, ['text']],
  ['qwen/qwen3-235b-a22b', 'Qwen: Qwen3 235B A22B', 0.13, 0.6, 131072, ['text']],
  ['qwen/qwen3-coder', 'Qwen: Qwen3 Coder 480B A35B', 0.3, 1.2, 262144, ['text']],
  ['qwen/qwen-max', 'Qwen: Qwen-Max', 1.6, 6.4, 32768, ['text']],
  ['moonshotai/kimi-k2', 'MoonshotAI: Kimi K2', 0.6, 2.5, 131072, ['text']],
  ['z-ai/glm-4.5', 'Z.AI: GLM 4.5', 0.6, 2.2, 131072, ['text']],
  ['minimax/minimax-m1', 'MiniMax: MiniMax M1', 0.4, 2.2, 1000000, ['text']],
  ['baidu/ernie-4.5-300b-a47b', 'Baidu: ERNIE 4.5 300B A47B', 0.28, 1.1, 123000, ['text']],
  // Unmatched: router (variable price), a near-miss (fuzzy suggestion only), an unrelated model.
  ['openrouter/auto', 'Auto Router', -1, -1, 2000000, ['text', 'image']],
  ['z-ai/glm-4.5-air', 'Z.AI: GLM 4.5 Air', 0.2, 1.1, 131072, ['text']],
  ['inception/mercury-coder', 'Inception: Mercury Coder', 0.25, 1, 128000, ['text']],
];

function openrouterJson() {
  return {
    data: OR_PRICES.map(([id, name, p, c, ctx, mods], i) => ({
      id,
      canonical_slug: id,
      name,
      created: 1735689600 + i * 86400,
      context_length: ctx,
      architecture: { modality: 'text->text', input_modalities: mods, output_modalities: ['text'] },
      pricing: { prompt: p < 0 ? '-1' : (p / 1e6).toFixed(10).replace(/0+$/, ''), completion: c < 0 ? '-1' : (c / 1e6).toFixed(10).replace(/0+$/, '') },
      top_provider: { context_length: ctx, is_moderated: false },
    })),
  };
}

async function main() {
  await mkdir(path.join(SEED, 'epoch'), { recursive: true });
  await mkdir(TEST_FIX, { recursive: true });
  const lm = lmarenaRows();
  await writeFile(path.join(SEED, 'lmarena.json'), JSON.stringify(lm) + '\n');
  for (const bench of Object.keys(EPOCH)) await writeFile(path.join(SEED, 'epoch', `${bench}.csv`), epochCsv(bench));
  await writeFile(path.join(SEED, 'epoch', '_meta.json'), JSON.stringify({ capturedOn: '2025-09-30' }) + '\n');
  await writeFile(path.join(SEED, 'openrouter.json'), JSON.stringify(openrouterJson(), null, 1) + '\n');

  // Tiny parquet sample (latest text/overall rows) for the decoder test.
  const sample = lm.configs[0]!.rows.filter((r) => r.leaderboard_publish_date === DATES.at(-1) && r.category === 'overall').slice(0, 8);
  const col = (k: string) => sample.map((r) => r[k]);
  const buf = parquetWriteBuffer({
    columnData: [
      { name: 'model_name', data: col('model_name'), type: 'STRING' },
      { name: 'organization', data: col('organization'), type: 'STRING' },
      { name: 'license', data: col('license'), type: 'STRING' },
      { name: 'rating', data: col('rating') as number[], type: 'DOUBLE' },
      { name: 'rating_lower', data: col('rating_lower') as number[], type: 'DOUBLE' },
      { name: 'rating_upper', data: col('rating_upper') as number[], type: 'DOUBLE' },
      { name: 'vote_count', data: col('vote_count') as number[], type: 'INT32' },
      { name: 'rank', data: col('rank') as number[], type: 'INT32' },
      { name: 'category', data: col('category'), type: 'STRING' },
      { name: 'leaderboard_publish_date', data: col('leaderboard_publish_date'), type: 'STRING' },
    ],
  });
  await writeFile(path.join(TEST_FIX, 'lmarena-sample.parquet'), new Uint8Array(buf));
  console.log(`lmarena rows: ${lm.configs.reduce((n, c) => n + c.rows.length, 0)}; fixtures written to ${SEED}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
