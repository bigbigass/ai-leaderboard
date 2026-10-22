import 'server-only';
import { getDb, hasDatabaseUrl } from '@ail/db';
import * as q from '@ail/db/queries';
import { unstable_cache } from 'next/cache';

/** Cache tag every DB-backed read carries; POST /api/revalidate {"tags":["db"]} refreshes all of them. */
export const DB_TAG = 'db';

let dbDown = false;

/**
 * Runs a DB read through Next's data cache. If DATABASE_URL is missing or the DB is unreachable
 * (e.g. CI build without a database), returns `fallback` instead of failing the build. Failures
 * are not cached, so the next ISR pass retries.
 */
function cachedRead<A extends unknown[], R>(key: string, fn: (db: ReturnType<typeof getDb>, ...args: A) => Promise<R>, fallback: R) {
  const cached = unstable_cache(async (...args: A) => fn(getDb(), ...args), [key], { tags: [DB_TAG, key], revalidate: 86400 });
  return async (...args: A): Promise<R> => {
    if (!hasDatabaseUrl() || dbDown) return fallback;
    try {
      return await cached(...args);
    } catch (err) {
      if (isConnectionError(err)) {
        dbDown = true;
        console.warn(`[data] database unreachable, rendering without data (${(err as Error).message})`);
        return fallback;
      }
      throw err;
    }
  };
}

function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  return (
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'CONNECT_TIMEOUT', 'EAI_AGAIN', '3D000', '28P01', '42P01'].includes(code) ||
    /connect|timeout|does not exist/i.test(e?.message ?? '')
  );
}

export const getModelList = cachedRead('models', (db) => q.getModelList(db), [] as q.ModelListItem[]);
export const getBoards = cachedRead('boards', (db) => q.getBoards(db), [] as q.BoardInfo[]);
export const getEnabledSources = cachedRead('sources', (db) => q.getEnabledSources(db), [] as q.SourceInfo[]);
export const getVendors = cachedRead('vendors', (db) => q.getVendors(db), [] as q.VendorInfo[]);
export const getBoardTable = cachedRead(
  'board-table',
  (db, source: string, board: string, date?: string) => q.getBoardTable(db, source, board, date),
  null as q.BoardTable | null,
);
export const getModelDetail = cachedRead('model-detail', (db, slug: string) => q.getModelDetail(db, slug), null as q.ModelDetail | null);

export type { BoardInfo, BoardRow, BoardTable, ModelDetail, ModelListItem, SourceInfo, VendorInfo } from '@ail/db/queries';
