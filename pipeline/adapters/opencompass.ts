import { NotEnabledError, type ScoreAdapter } from '../types';

/**
 * OpenCompass — DISABLED (enabled=false in sources.config.ts). Redistribution terms for the published
 * rankings are unconfirmed, so this adapter intentionally fetches nothing. The site may only link out.
 */
export const opencompassAdapter: ScoreAdapter<never> = {
  id: 'opencompass',
  name: 'OpenCompass',
  url: 'https://rank.opencompass.org.cn',
  license: 'Unconfirmed — disabled',
  licenseUrl: null,
  attribution: 'OpenCompass',
  kind: 'scores',
  async fetch() {
    throw new NotEnabledError('opencompass');
  },
  parse() {
    return [];
  },
};
