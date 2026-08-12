/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function apiPort(): string {
  const port = process.env.API_PORT;
  if (process.env.TREEMAPPER_E2E && (!port || port === '3001')) {
    throw new Error('TREEMAPPER_E2E är satt men API_PORT pekar på utvecklingsservern — e2e skulle skriva i wedin.db');
  }
  return port ?? '3001';
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // An e2e run must never proxy to the development API: that server is on the
  // real wedin.db, and a browser test would edit the family's own records.
  server: { proxy: { '/api': `http://localhost:${apiPort()}` } },
  test: {
    environment: 'node',
    passWithNoTests: true,
    // Keeps every test away from the real wedin.db — see the file itself.
    setupFiles: ['./vitest.setup.ts'],
    // e2e/*.spec.ts belongs to Playwright, not vitest
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
