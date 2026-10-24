import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "vendor/shared/test/**/*.test.ts"],
    pool: "threads",
  },
});
