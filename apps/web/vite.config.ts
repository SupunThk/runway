import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Keep wallet clients and UI error handling on one viem module instance.
  resolve: { dedupe: ['viem'] },
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
});
