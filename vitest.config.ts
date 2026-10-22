import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'pipeline', root: './pipeline', include: ['tests/**/*.test.ts'], environment: 'node' },
      },
      {
        resolve: { alias: { '@': path.resolve(__dirname, 'apps/web/src'), 'server-only': path.resolve(__dirname, 'apps/web/test/server-only-stub.ts') } },
        test: { name: 'web', root: './apps/web', include: ['test/**/*.test.ts'], environment: 'node', server: { deps: { inline: ['next-intl'] } } },
      },
    ],
  },
});
