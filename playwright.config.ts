import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // Every spec shares one SQLite file (.e2e.db) and several of them write to
  // it — editing, merging, dismissing. Running workers in parallel let those
  // writes race and silently lose one another, so the suite runs serially.
  workers: 1,
  projects: [
    /**
     * A clone of this repository, with no family tree in it.
     *
     * Its own server on its own empty directory, because the suite below
     * starts from a copy of a populated database and so can never see what a
     * stranger sees. `first-run.spec.ts` is the only spec that runs here, and
     * it is excluded from the main project for the same reason in reverse.
     */
    {
      name: 'first-run',
      testMatch: /first-run\.spec\.ts/,
      use: { baseURL: 'http://localhost:5198' },
    },
    {
      name: 'e2e',
      testIgnore: /first-run\.spec\.ts/,
      use: { baseURL: 'http://localhost:5199' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:first-run',
      url: 'http://localhost:5198',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev:e2e',
      url: 'http://localhost:5199',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
