import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4317/play/floeline/',
    ...devices['Desktop Chrome'],
    viewport: { width: 1100, height: 820 },
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs 4317',
    url: 'http://localhost:4317/play/floeline/index.html',
    reuseExistingServer: false,
  },
});
