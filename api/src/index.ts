import { createApp } from './app.js';
import { createPool } from './db.js';

const port = Number(process.env.PORT ?? 8080);
createApp(createPool()).listen(port, () => {
  console.log(`Schedu-le API listening on :${port}`);
});
