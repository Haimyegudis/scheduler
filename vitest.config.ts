import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globalSetup: './tests/global-setup.ts',
    env: { DATABASE_URL: 'file:./test.db', JWT_SECRET: 'test-secret' },
    fileParallelism: false,
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
