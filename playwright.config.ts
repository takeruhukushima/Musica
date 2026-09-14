// MAGI
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  timeout: 60_000,
  webServer: {
    command: 'pnpm build && pnpm preview --port 4321',
    url: 'http://localhost:4321/Musica/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:4321',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // iPad Safari 近似（AC-21）
    { name: 'ipad-webkit', use: { ...devices['iPad (gen 7)'] } },
  ],
});
// /MAGI
