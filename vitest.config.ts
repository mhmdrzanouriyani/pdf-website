import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    env: { PDFLY_DATA_DIR: 'node_modules/.tmp/pdfly-test-data', AI_PROVIDER: 'none' },
  },
})
