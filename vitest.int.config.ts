import { defineConfig } from 'vitest/config';

// Integration tests need a real Oracle and are slower than the unit suite,
// so they live in test/ and run under their own config.
export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,   // one shared database; serial keeps state predictable
  },
});
