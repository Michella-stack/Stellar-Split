import { defineConfig } from 'vite';
export default defineConfig({ build: { outDir: 'dist-spike', rollupOptions: { input: 'spike.html' } } });
