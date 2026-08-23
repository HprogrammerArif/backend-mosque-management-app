import { defineConfig } from 'vitest/config';

// Unit tests only. Integration tests are excluded here and run via `pnpm test:int`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
