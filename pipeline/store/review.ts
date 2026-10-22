import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchReviewQueue, type Db } from '@ail/db';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { ReviewItem } from '../matcher/matcher';

export const REVIEW_JSON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../out/review.json');

/** Upsert unmatched names. Suggestions are stored for humans; nothing here changes any match. */
export async function persistReviewQueue(db: Db, items: ReviewItem[]): Promise<void> {
  for (const it of items) {
    await db
      .insert(matchReviewQueue)
      .values({
        sourceSlug: it.source,
        rawName: it.rawName,
        rawOrg: it.rawOrg,
        suggestedModelSlug: it.suggestedModelSlug,
        suggestionScore: it.score,
        occurrences: it.occurrences,
      })
      .onConflictDoUpdate({
        target: [matchReviewQueue.sourceSlug, matchReviewQueue.rawName],
        set: {
          suggestedModelSlug: it.suggestedModelSlug,
          suggestionScore: it.score,
          occurrences: it.occurrences,
          lastSeen: sql`now()`,
          status: sql`CASE WHEN ${matchReviewQueue.status} = 'ignored' THEN 'ignored' ELSE 'pending' END`,
        },
      });
  }
}

/** Mark pending queue items resolved once aliases.yaml covers them (same exact/normalized rules as the matcher). */
export async function resolveCoveredItems(db: Db, isCovered: (source: string, rawName: string) => boolean): Promise<number> {
  const pending = await db
    .select({ id: matchReviewQueue.id, sourceSlug: matchReviewQueue.sourceSlug, rawName: matchReviewQueue.rawName })
    .from(matchReviewQueue)
    .where(eq(matchReviewQueue.status, 'pending'));
  const ids = pending.filter((p) => isCovered(p.sourceSlug, p.rawName)).map((p) => p.id);
  if (ids.length) await db.update(matchReviewQueue).set({ status: 'resolved' }).where(inArray(matchReviewQueue.id, ids));
  return ids.length;
}

export async function pendingReview(db: Db) {
  return db
    .select()
    .from(matchReviewQueue)
    .where(eq(matchReviewQueue.status, 'pending'))
    .orderBy(desc(matchReviewQueue.suggestionScore), asc(matchReviewQueue.sourceSlug), asc(matchReviewQueue.rawName));
}

export async function writeReviewJson(items: unknown[], file = REVIEW_JSON): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ generatedAt: new Date().toISOString(), note: 'Suggestions are never applied automatically. Approve by adding the alias to pipeline/data/aliases.yaml.', items }, null, 2) + '\n');
}
