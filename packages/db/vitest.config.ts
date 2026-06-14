import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    pool: "forks",
    // Don't fail if no test files exist yet — the package can grow tests later.
    passWithNoTests: true
  }
});
