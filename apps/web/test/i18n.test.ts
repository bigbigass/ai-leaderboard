import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/i18n/routing';

type Tree = { [k: string]: string | Tree };
const load = (l: string): Tree => JSON.parse(readFileSync(path.resolve(__dirname, `../messages/${l}.json`), 'utf8')) as Tree;
const flatten = (t: Tree, prefix = ''): Record<string, string> =>
  Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});

/** Top-level ICU argument names in a message ({name}, {count, plural, …}). */
function argNames(msg: string): string[] {
  const names = new Set<string>();
  const walk = (els: unknown[]) => {
    for (const el of els as { type: number; value?: string; options?: Record<string, { value: unknown[] }> }[]) {
      if (el.value && el.type !== 0 && el.type !== 7) names.add(el.value);
      if (el.options) for (const o of Object.values(el.options)) walk(o.value);
    }
  };
  walk(new IntlMessageFormat(msg, 'en').getAst());
  return [...names].sort();
}

const en = flatten(load('en'));

describe('messages', () => {
  it('ships all 7 locales', () => {
    expect([...LOCALES].sort()).toEqual(['de', 'en', 'es', 'fr', 'ja', 'pt', 'zh']);
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      const msgs = flatten(load(locale));

      it('has exactly the same keys as en (no missing, no extra)', () => {
        expect(Object.keys(msgs).sort()).toEqual(Object.keys(en).sort());
      });

      it('has no empty strings and every message compiles as ICU', () => {
        for (const [k, v] of Object.entries(msgs)) {
          expect(v.trim(), k).not.toBe('');
          expect(() => new IntlMessageFormat(v, locale), k).not.toThrow();
        }
      });

      it('uses the same placeholders as en', () => {
        for (const [k, v] of Object.entries(msgs)) expect(argNames(v), `${locale}:${k}`).toEqual(argNames(en[k]!));
      });

      if (locale !== 'en') {
        it('is actually translated (not an English copy)', () => {
          const same = Object.entries(msgs).filter(([k, v]) => v === en[k] && v.length > 25);
          expect(same.map(([k]) => k)).toEqual([]);
        });
      }
    });
  }
});
