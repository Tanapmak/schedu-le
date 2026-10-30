import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

export async function listSqlFiles(dir: string): Promise<string[]> {
  const names = await readdir(dir);
  return names.filter((n) => n.endsWith('.sql')).sort();
}

// Applies each migration once, in file-name order, each inside its own transaction.
export async function migrate(client: pg.ClientBase, dir: string): Promise<string[]> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set(
    (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );
  const applied: string[] = [];
  for (const name of await listSqlFiles(dir)) {
    if (done.has(name)) continue;
    const sql = await readFile(path.join(dir, name), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${name} failed: ${(err as Error).message}`);
    }
    applied.push(name);
  }
  return applied;
}

export async function runSqlDir(client: Pick<pg.ClientBase, 'query'>, dir: string): Promise<string[]> {
  const files = await listSqlFiles(dir);
  for (const name of files) await client.query(await readFile(path.join(dir, name), 'utf8'));
  return files;
}
