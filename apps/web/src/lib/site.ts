export const SITE_NAME = 'AI Leaderboard';

/** Absolute origin without trailing slash. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

export function abs(path: string): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** ISR window for every page; the ingest job also revalidates on demand. */
export const REVALIDATE_SECONDS = 86400;

/** Mirrors pipeline/config/thresholds.ts (used for explanatory copy only). */
export const DISAGREEMENT_THRESHOLD = Number(process.env.DISAGREEMENT_THRESHOLD ?? 25);
