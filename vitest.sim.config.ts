import { defineConfig } from 'vitest/config';

// AI 对战模拟（较慢，不在默认测试里跑）：npm run sim
export default defineConfig({
  test: { include: ['scripts/**/*.sim.ts'], environment: 'node' },
});
