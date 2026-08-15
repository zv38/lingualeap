import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['api/__tests__/**/*.test.{js,mjs}'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['api/**/*.js'],
      exclude: ['api/__tests__/**', 'api/data/**', 'api/node_modules/**'],
    },
    testTimeout: 15000,
  },
})