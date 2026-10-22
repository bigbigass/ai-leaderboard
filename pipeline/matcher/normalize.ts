/**
 * Normalized-exact key: case-, whitespace- and punctuation-insensitive.
 * "DeepSeek-V3 (0324)" → "deepseekv30324". Nothing else is stripped (no vendor prefixes,
 * no date rewriting): anything beyond this must be an explicit alias.
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}
