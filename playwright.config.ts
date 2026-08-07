import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // Every spec shares one SQLite file (.e2e.db) and several of them write to
  // it — editing, merging, dismissing. Running workers in parallel let those
  // writes race and silently lose one another, so the suite runs serially.
  workers: 1,
  use: { baseURL: 'http://localhost:5199' },
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
