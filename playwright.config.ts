import { defineConfig, devices } from '@playwright/test';

const remote = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 3,
  reporter: 'list',
  use: {
    baseURL: remote ?? 'http://127.0.0.1:4180',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iPhone-Chromium', use: { ...devices['iPhone 13 landscape'], browserName: 'chromium' } },
    { name: 'iPhone-WebKit', use: { ...devices['iPhone 13 landscape'], browserName: 'webkit' } },
    { name: 'Pixel-Chromium', use: { ...devices['Pixel 7 landscape'], browserName: 'chromium' } },
    { name: 'Desktop', use: { browserName: 'chromium', viewport: { width: 1600, height: 900 } } },
  ],
  webServer: remote ? undefined : {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4180 --strictPort',
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
