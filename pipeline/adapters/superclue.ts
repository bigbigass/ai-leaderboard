import { NotEnabledError, type ScoreAdapter } from '../types';

/**
 * SuperCLUE — DISABLED (enabled=false in sources.config.ts). Redistribution terms for the published
 * rankings are unconfirmed, so this adapter intentionally fetches nothing. The site may only link out.
 */
export const superclueAdapter: ScoreAdapter<never> = {
  id: 'superclue',
  name: 'SuperCLUE',
  url: 'https://www.superclueai.com',
  license: 'Unconfirmed — disabled',
  licenseUrl: null,
  attribution: 'SuperCLUE',
  kind: 'scores',
  async fetch() {
    throw new NotEnabledError('superclue');
  },
  parse() {
    return [];
  },
};
