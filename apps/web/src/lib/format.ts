export function fmtDate(locale: string, iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(d);
}

export const fmtMonth = (locale: string, iso: string) => fmtDate(locale, iso, { year: 'numeric', month: 'long' });

export function fmtNum(locale: string, n: number | null | undefined, digits = 0): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export function fmtPrice(locale: string, n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: n < 1 ? 3 : 2 }).format(n);
}

export function fmtScore(locale: string, score: number | null, scoreType: string): string {
  if (score == null) return '—';
  return scoreType === 'percent' ? `${fmtNum(locale, score, 1)}%` : fmtNum(locale, score, 0);
}

export function fmtContext(locale: string, n: number | null | undefined): string {
  if (!n) return '—';
  return n >= 1000 ? `${fmtNum(locale, Math.round(n / 1000))}K` : fmtNum(locale, n);
}

/** "Top x%" from a percentile (100 = first place). */
export const topPct = (p: number) => Math.max(1, Math.round(100 - p + 1));

/** Message key for a variant_key like "reasoning=on;style_control=on". */
export function variantKeys(variant: string): string[] {
  if (!variant) return ['default'];
  return variant.split(';').map((kv) => {
    const [k, v] = kv.split('=');
    if (k === 'reasoning') return { on: 'reasoningOn', off: 'reasoningOff', high: 'reasoningHigh', low: 'reasoningLow', medium: 'reasoningMedium' }[v ?? ''] ?? 'default';
    if (k === 'style_control') return 'styleControl';
    return 'default';
  });
}
