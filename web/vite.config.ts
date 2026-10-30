import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the API runs on :8080; in production Express serves web/dist itself.
// allowedHosts lets Cloud Shell's Web Preview (*.cloudshell.dev) reach the dev server.
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.cloudshell.dev'],
    proxy: { '/api': 'http://localhost:8080' },
  },
});
