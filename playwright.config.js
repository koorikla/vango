import { defineConfig, devices } from '@playwright/test';

const PORT = 1314;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    // Chromium-based so `npm run test:install` only needs one browser
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  // Hugo serves the site itself with production minification, so the tests
  // exercise the same output that gets deployed — and no extra web server
  // dependency is needed.
  webServer: {
    command: `hugo server --minify --disableFastRender --port ${PORT} --baseURL http://localhost:${PORT}/`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
