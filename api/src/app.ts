import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { webDist } from './paths.js';

export function createApp(pool: pg.Pool) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: 'up' });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // In production the same container serves the built web app.
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  return app;
}
