import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb } from './client';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

async function main() {
  const db = getDb({ max: 1 });
  await migrate(db, { migrationsFolder });
  console.log('migrations applied');
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
