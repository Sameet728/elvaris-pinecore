import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Needed for some PineTS browser dependencies
      include: ['buffer', 'process', 'util'],
    }),
  ],
  optimizeDeps: {
    include: ['@luxalgo/vela', '@luxalgo/vela-pinets', 'pinets'],
    exclude: [],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
          vela: ['@luxalgo/vela'],
          'vela-pinets': ['@luxalgo/vela-pinets', 'pinets'],
        },
      },
    },
  },
});
