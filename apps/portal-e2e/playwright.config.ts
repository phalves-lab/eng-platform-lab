import { defineConfig, devices } from '@playwright/test'
import { API_PORT, GITHUB_PORT, REPO_ROOT, SCORECARD_FILE, WEB_PORT, databaseUrl } from './env.js'

const ci = Boolean(process.env.CI)

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    { name: 'claro', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'escuro', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
  ],
  webServer: [
    {
      command: 'npx tsx fake-github.ts',
      port: GITHUB_PORT,
      env: { E2E_GITHUB_PORT: String(GITHUB_PORT) },
      reuseExistingServer: false,
    },
    {
      command: 'node --import ./dist/instrumentation.js dist/main.js',
      cwd: `${REPO_ROOT}apps/portal-api`,
      url: `http://127.0.0.1:${API_PORT}/health/ready`,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        PORTAL_AUTH_MODE: 'dev',
        PORTAL_DEV_USER: 'ana.dev',
        PORTAL_HANDBOOK_DIR: `${REPO_ROOT}handbook`,
        DATABASE_URL: databaseUrl(),
        PORTAL_GITHUB_TOKEN: 'e2e-fake-github',
        PORTAL_GITHUB_API_URL: `http://127.0.0.1:${GITHUB_PORT}`,
        PORTAL_SCORECARD_DATA: SCORECARD_FILE,
        OTEL_ENABLED: 'false',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next start --port ${WEB_PORT}`,
      cwd: `${REPO_ROOT}apps/portal-web`,
      url: `http://127.0.0.1:${WEB_PORT}/api/health`,
      env: {
        PORTAL_API_URL: `http://127.0.0.1:${API_PORT}`,
        PORTAL_ENV: 'development',
        PORTAL_AUTH_MODE: 'dev',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
