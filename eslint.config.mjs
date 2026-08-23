import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // ADR-0002 / ADR-0009: the driver is confined to the infrastructure layer,
    // and no web framework may enter the codebase at all.
    files: ['src/**/*.ts'],
    ignores: ['src/infrastructure/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'oracledb', message: 'Database access belongs in src/infrastructure/ only (ADR-0002).' },
          { name: 'express', message: 'No web framework (ADR-0009).' },
          { name: 'fastify', message: 'No web framework (ADR-0009).' },
          { name: 'koa', message: 'No web framework (ADR-0009).' },
        ],
      }],
    },
  },
);
