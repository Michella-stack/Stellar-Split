import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const shared = fileURLToPath(new URL('../../packages/shared/src', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Domain rules shared with the API (amounts, splits, balances). See packages/shared.
    alias: { '@shared': shared },
  },
  server: {
    fs: { allow: ['.', shared] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
