import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Same depth from src/ (tsx) and dist/ (node), so one relative path works for both.
export const repoRoot = path.resolve(here, '..', '..');
export const migrationsDir = path.join(repoRoot, 'db', 'migrations');
export const seedDir = path.join(repoRoot, 'db', 'seed');
export const webDist = path.join(repoRoot, 'web', 'dist');
