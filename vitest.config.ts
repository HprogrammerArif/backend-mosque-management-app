import { defineConfig } from 'vitest/config';

// Unit tests only. Integration tests are excluded here and run via `pnpm test:int`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/infrastructure/database/migrate-cli.ts'],
    },
  },
});
