import { createPool } from './db.js';
import { migrationsDir } from './paths.js';
import { migrate } from './sqlFiles.js';

const pool = createPool();
const client = await pool.connect();
try {
  const applied = await migrate(client, migrationsDir);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} finally {
  client.release();
  await pool.end();
}
