import { defineConfig } from "vitest/config";

// Outreach engine unit tests (ported from the validated Phase 0 proof).
// Node environment; network is blocked and credentials are stripped in test/outreach/setup.ts.
export default defineConfig({
  test: {
    include: ["test/outreach/**/*.test.{ts,tsx}", "test/security/**/*.test.ts", "test/admin/**/*.test.{ts,tsx}"],
    setupFiles: ["test/outreach/setup.ts"],
    testTimeout: 15000,
  },
});
