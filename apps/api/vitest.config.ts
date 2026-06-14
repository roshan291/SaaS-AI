import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Tests should never depend on real Mongo / Redis / Cloudinary; mock
    // those at the module boundary. CI runs with no env vars by default.
    pool: "forks",
    testTimeout: 10_000
  }
});
