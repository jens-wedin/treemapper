/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3001}` } },
  test: {
    environment: 'node',
    passWithNoTests: true,
    // e2e/*.spec.ts belongs to Playwright, not vitest
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
