import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@tanstack/react-query') || id.includes('node_modules/@tanstack/react-router')) {
            return 'vendor-router-query';
          }

          if (
            id.includes('node_modules/@dnd-kit/') ||
            id.includes('node_modules/react-hook-form') ||
            id.includes('node_modules/zod')
          ) {
            return 'vendor-ui-editor';
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
