import { epochAdapter } from './adapters/epoch';
import { livebenchAdapter } from './adapters/livebench';
import { lmarenaAdapter } from './adapters/lmarena';
import { opencompassAdapter } from './adapters/opencompass';
import { openrouterAdapter } from './adapters/openrouter';
import { superclueAdapter } from './adapters/superclue';
import type { SourceAdapter, SourceMeta } from './types';

/**
 * One entry per source. `enabled: false` sources are never fetched and never appear in the UI,
 * sitemap or JSON-LD. Artificial Analysis is intentionally absent: never add an adapter for it.
 */
export const SOURCES_CONFIG: { adapter: SourceAdapter; enabled: boolean }[] = [
  { adapter: lmarenaAdapter as SourceAdapter, enabled: true },
  { adapter: epochAdapter as SourceAdapter, enabled: true },
  { adapter: openrouterAdapter as SourceAdapter, enabled: true },
  // Disabled until redistribution licenses are confirmed in writing.
  { adapter: livebenchAdapter as SourceAdapter, enabled: false },
  { adapter: opencompassAdapter as SourceAdapter, enabled: false },
  { adapter: superclueAdapter as SourceAdapter, enabled: false },
];

export type SourceWithFlag = SourceMeta & { enabled: boolean };

export function allSources(): SourceWithFlag[] {
  return SOURCES_CONFIG.map(({ adapter, enabled }) => ({
    id: adapter.id,
    name: adapter.name,
    url: adapter.url,
    license: adapter.license,
    licenseUrl: adapter.licenseUrl,
    attribution: adapter.attribution,
    kind: adapter.kind,
    enabled,
  }));
}

export function enabledAdapters(): SourceAdapter[] {
  return SOURCES_CONFIG.filter((s) => s.enabled).map((s) => s.adapter);
}

export function getAdapter(id: string): { adapter: SourceAdapter; enabled: boolean } | undefined {
  return SOURCES_CONFIG.find((s) => s.adapter.id === id);
}
