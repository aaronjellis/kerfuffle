import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/boxer/',
  build: {
    outDir: 'dist/boxer',
    emptyOutDir: true,
  },
});
