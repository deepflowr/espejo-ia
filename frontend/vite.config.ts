import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    watch: {
      ignored: ['**/public/models/**'],
    },
  },
  build: {
    outDir: 'dist',
  },
  optimizeDeps: {
    include: [],
  },
});
