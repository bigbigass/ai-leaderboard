import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

let cached: { db: Db; sql: postgres.Sql } | null = null;

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Returns a shared Drizzle client. Throws if DATABASE_URL is unset. */
export function getDb(opts: { max?: number } = {}): Db {
  return getConnection(opts).db;
}

export function getConnection(opts: { max?: number } = {}): { db: Db; sql: postgres.Sql } {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, {
    max: opts.max ?? 5,
    connect_timeout: 5,
    idle_timeout: 20,
    // Neon's pooled endpoint (PgBouncer, transaction mode) does not support prepared statements.
    prepare: false,
    onnotice: () => {},
  });
  cached = { db: drizzle(sql, { schema }), sql };
  return cached;
}

export async function closeDb(): Promise<void> {
  if (!cached) return;
  const { sql } = cached;
  cached = null;
  await sql.end({ timeout: 5 });
}
