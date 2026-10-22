import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(HERE, 'fixtures');
export const SEED_DIR = path.resolve(HERE, '../../packages/db/seed');
export const REPO_ROOT = path.resolve(HERE, '../..');
