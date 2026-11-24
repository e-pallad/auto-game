import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths: itch.io serves the game from a subdirectory inside an iframe.
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
