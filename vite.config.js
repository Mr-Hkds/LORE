import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    proxy: {
      '/api/recommendations': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/stories': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
