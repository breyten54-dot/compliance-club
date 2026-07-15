import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./test/setup.js'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
