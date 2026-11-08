import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:5183/enplayer/',
    viewport: { width: 1920, height: 1080 },
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -w player -- --host 127.0.0.1 --port 5183 --strictPort',
      url: 'http://127.0.0.1:5183/enplayer/',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/browser/fixture-server.mjs',
      url: 'http://127.0.0.1:5184/health',
      reuseExistingServer: false,
    },
  ],
});
