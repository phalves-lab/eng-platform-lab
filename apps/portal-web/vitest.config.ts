import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@lab/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/labels.ts',
        'src/lib/utils.ts',
        'src/lib/delivery.ts',
        'src/lib/dora.ts',
        'src/lib/flow.ts',
        'src/lib/boards.ts',
        'src/lib/releases.ts',
        'src/lib/release-write.ts',
        'src/lib/ask-stream.ts',
        'src/lib/citations.ts',
        'src/lib/conversations.ts',
        'src/lib/chat-modes.ts',
        'src/lib/quality.ts',
        'src/lib/work.ts',
        'src/lib/projects.ts',
        'src/lib/ai-quality.ts',
        'src/components/navigation.ts',
        'src/lib/auth-config.ts',
        'src/lib/session-token.ts',
        'src/lib/access.ts',
        'src/lib/audit.ts',
      ],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
})
