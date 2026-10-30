import pg from 'pg';

// Cloud Run connects over the Cloud SQL unix socket (DB_SOCKET + DB_*);
// local dev and CI use DATABASE_URL.
export function poolConfig(env: NodeJS.ProcessEnv = process.env): pg.PoolConfig {
  if (env.DATABASE_URL) return { connectionString: env.DATABASE_URL };
  if (env.DB_SOCKET) {
    return {
      host: env.DB_SOCKET,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    };
  }
  throw new Error('Set DATABASE_URL, or DB_SOCKET with DB_NAME / DB_USER / DB_PASSWORD');
}

export function createPool(env: NodeJS.ProcessEnv = process.env): pg.Pool {
  return new pg.Pool({ ...poolConfig(env), max: 5 });
}
