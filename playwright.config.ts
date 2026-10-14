import { defineConfig, devices } from '@playwright/test';

// E2E contra o build de produção, com banco local recém-semeado (drivers locais de auth/storage).
const PORT = 3100;
const env = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/dmcaixa_e2e',
  LOCAL_SUPABASE_SHIM: 'true',
  AUTH_DRIVER: 'local',
  STORAGE_DRIVER: 'local',
  LOCAL_STORAGE_DIR: process.env.E2E_STORAGE_DIR ?? '/var/tmp/dmcaixa-storage-e2e',
  SESSION_SECRET: 'e2e-only-secret-0123456789abcdef0123456789abcdef',
  APP_URL: `http://localhost:${PORT}`,
  DEMO_PASSWORD: 'Demo-E2E-2026',
};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  webServer: {
    // E2E_PGLITE=1 → executa a mesma suíte contra o modo demonstração (banco embutido PGlite, só Node.js)
    command: process.env.E2E_PGLITE
      ? `node scripts/demo.mjs --reset --no-open`
      : `node scripts/db-reset.mjs && npx tsx scripts/seed.ts && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: process.env.E2E_PGLITE ? { PORT: String(PORT), DEMO_PASSWORD: env.DEMO_PASSWORD, DEMO_DIR: process.env.E2E_DEMO_DIR ?? '/var/tmp/dmcaixa-demo-e2e' } : env,
  },
});
