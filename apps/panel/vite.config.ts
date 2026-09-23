import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    target: ['chrome88', 'es2020'],
  },
});
