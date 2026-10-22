import { createHash } from 'node:crypto';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

/**
 * GET with exponential backoff (1s, 4s, 16s by default). Retries network errors, 429 and 5xx;
 * other 4xx fail immediately.
 */
export async function fetchWithRetry(url: string, init: RequestInit = {}, opts: RetryOptions = {}): Promise<Response> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 1000;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(base * 4 ** (attempt - 1));
    try {
      const res = await doFetch(url, {
        ...init,
        headers: { 'user-agent': 'ai-leaderboard-pipeline/0.1 (+https://github.com/bigbigass/ai-leaderboard)', ...init.headers },
      });
      if (res.ok) return res;
      lastErr = new HttpError(res.status, url);
      if (res.status !== 429 && res.status < 500) throw lastErr;
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err;
    }
  }
  throw lastErr;
}

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Coerce parquet/CSV date-ish values (Date, epoch days/ms, strings) to YYYY-MM-DD. */
export function toIsoDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number' || typeof v === 'bigint') {
    const n = Number(v);
    // parquet DATE = days since epoch; TIMESTAMP_MILLIS = ms
    const d = new Date(n < 1e6 ? n * 86_400_000 : n);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

export function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'string' ? Number(v.replace(/%$/, '').trim()) : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
}

export function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
