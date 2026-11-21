import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['@lab/source'] },
  ssr: { resolve: { conditions: ['@lab/source'] } },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/collect-jira.ts'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
})
