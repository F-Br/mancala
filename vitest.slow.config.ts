import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: './src/test/setup.ts',
    environment: 'node',
    testTimeout: 300000,
    hookTimeout: 300000,
    include: [
      'src/engine/__tests__/tablebase.test.ts',
      'src/engine/__tests__/mangalaTablebase.test.ts',
      'src/bots/__tests__/selfplay.test.ts',
    ],
  },
})
