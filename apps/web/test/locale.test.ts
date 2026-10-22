import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { isBot, pickLocale } from '@/lib/locale-detect';
import middleware from '@/middleware';

describe('Accept-Language detection', () => {
  it('picks the highest-q supported language, falling back to en', () => {
    expect(pickLocale('zh-CN,zh;q=0.9,en;q=0.8')).toBe('zh');
    expect(pickLocale('nl-NL,de;q=0.7,fr;q=0.9')).toBe('fr');
    expect(pickLocale('pt-BR')).toBe('pt');
    expect(pickLocale('ko-KR')).toBe('en');
    expect(pickLocale(undefined)).toBe('en');
  });

  it('recognises crawlers', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBot('Mozilla/5.0 (Macintosh) Safari/605')).toBe(false);
  });
});

describe('middleware', () => {
  const run = (url: string, headers: Record<string, string> = {}) => middleware(new NextRequest(new URL(url), { headers }));

  it('redirects / by Accept-Language, and bots to /en', () => {
    const r = run('http://x.test/', { 'accept-language': 'ja,en;q=0.5' });
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toBe('http://x.test/ja');
    expect(run('http://x.test/', { 'accept-language': 'ja', 'user-agent': 'Googlebot' }).headers.get('location')).toBe('http://x.test/en');
  });

  it('301s non-canonical compare slugs to alphabetical order', () => {
    const r = run('http://x.test/de/compare/qwen3-vs-gpt-5');
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('http://x.test/de/compare/gpt-5-vs-qwen3');
    expect(run('http://x.test/de/compare/gpt-5-vs-qwen3').status).not.toBe(301);
  });
});
