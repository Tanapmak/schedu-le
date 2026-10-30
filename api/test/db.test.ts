import { describe, expect, it } from 'vitest';
import { poolConfig } from '../src/db.js';

describe('poolConfig', () => {
  it('prefers DATABASE_URL', () => {
    expect(poolConfig({ DATABASE_URL: 'postgres://x', DB_SOCKET: '/cloudsql/y' })).toEqual({
      connectionString: 'postgres://x',
    });
  });

  it('uses the Cloud SQL socket on Cloud Run', () => {
    expect(
      poolConfig({ DB_SOCKET: '/cloudsql/p:r:i', DB_NAME: 'schedule', DB_USER: 'app', DB_PASSWORD: 's' }),
    ).toEqual({ host: '/cloudsql/p:r:i', database: 'schedule', user: 'app', password: 's' });
  });

  it('fails loudly when nothing is configured', () => {
    expect(() => poolConfig({})).toThrow(/DATABASE_URL/);
  });
});
