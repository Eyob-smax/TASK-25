import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['api_tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 30000,
  },
});
