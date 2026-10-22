import type { UnifiedCategory } from './types';

/** `${source}:${group}:${rawCategory}` → unified category. Unmapped → 'other' + warning. */
export const CATEGORY_MAP: Record<string, UnifiedCategory> = {
  'lmarena:text:overall': 'overall',
  'lmarena:text:coding': 'coding',
  'lmarena:text:math': 'math',
  'lmarena:text:chinese': 'chinese',
  'lmarena:text:hard_prompts': 'reasoning',
  'lmarena:text:creative_writing': 'writing',
  'lmarena:text:instruction_following': 'other',
  'lmarena:text:multi_turn': 'other',
  'lmarena:text:longer_query': 'other',
  'lmarena:text:english': 'other',
  'lmarena:webdev:overall': 'coding',
  'lmarena:vision:overall': 'vision',
  'lmarena:search:overall': 'other',
  'lmarena:agent:overall': 'agent',
  'epoch:gpqa_diamond': 'knowledge',
  'epoch:frontiermath': 'math',
  'epoch:otis_mock_aime': 'math',
  'epoch:swe_bench_verified': 'coding',
  'livebench:global_average': 'overall',
  'livebench:coding': 'coding',
  'livebench:reasoning': 'reasoning',
  'livebench:mathematics': 'math',
};

export function mapCategory(key: string): { category: UnifiedCategory; mapped: boolean } {
  const hit = CATEGORY_MAP[key.toLowerCase()];
  return hit ? { category: hit, mapped: true } : { category: 'other', mapped: false };
}

/** 'hard_prompts' → 'hard-prompts' (URL-safe board key segment). */
export function slugPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
