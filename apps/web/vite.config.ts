import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'wallet',
              test: /node_modules[\\/](wagmi|@wagmi|viem|ox|abitype|@noble|@scure|@adraffy)[\\/]/,
              priority: 30,
            },
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'query',
              test: /node_modules[\\/]@tanstack[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  // Keep wallet clients and UI error handling on one viem module instance.
  resolve: { dedupe: ['viem'] },
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
});
