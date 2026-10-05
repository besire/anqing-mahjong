import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// base: './' 让打包结果可以放在任意子路径（GitHub Pages / 任意静态托管）
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
