import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the API runs on :8080; in production Express serves web/dist itself.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
