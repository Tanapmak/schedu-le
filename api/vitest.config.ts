import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DB tests share one database and reset it, so run files one at a time.
    fileParallelism: false,
  },
});
