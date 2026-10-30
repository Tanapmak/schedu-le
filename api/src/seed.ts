import path from 'node:path';
import { createPool } from './db.js';
import { seedDir } from './paths.js';
import { runSqlDir } from './sqlFiles.js';

// `npm run seed` loads reference data; `npm run seed -- --dev` adds sample people.
const pool = createPool();
const client = await pool.connect();
try {
  const files = await runSqlDir(client, seedDir);
  if (process.argv.includes('--dev')) files.push(...(await runSqlDir(client, path.join(seedDir, 'dev'))));
  console.log(`Seeded: ${files.join(', ')}`);
} finally {
  client.release();
  await pool.end();
}
