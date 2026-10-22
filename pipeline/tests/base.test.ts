import { describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, HttpError, toIsoDate, toNum } from '../adapters/base';

const res = (status: number) => new Response(status === 200 ? 'ok' : 'x', { status });

describe('fetchWithRetry', () => {
  it('retries 5xx/429 and network errors with exponential backoff', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(200));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const r = await fetchWithRetry('https://x', {}, { fetchImpl, sleep, retries: 3, baseDelayMs: 1000 });
    expect(r.status).toBe(200);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 4000, 16000]);
  });

  it('does not retry other 4xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(404));
    await expect(fetchWithRetry('https://x', {}, { fetchImpl, sleep: async () => {} })).rejects.toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(500));
    await expect(fetchWithRetry('https://x', {}, { fetchImpl, sleep: async () => {}, retries: 2 })).rejects.toThrow(/HTTP 500/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('coercion helpers', () => {
  it('toIsoDate / toNum', () => {
    expect(toIsoDate('20250930')).toBe('2025-09-30');
    expect(toIsoDate(null)).toBeNull();
    expect(toNum('72.5%')).toBe(72.5);
    expect(toNum('n/a')).toBeNull();
  });
});
