import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: [
      'packages/*/test/**/*.spec.ts',
      'packages/modules/*/test/**/*.spec.ts',
      'apps/panel/test/**/*.spec.tsx',
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
    ],
    setupFiles: ['tests/setup.ts'],
  },
});
