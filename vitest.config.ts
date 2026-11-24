import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Pin the process timezone so local-day arithmetic and weekday labels are
    // deterministic regardless of the machine running the suite.
    env: { TZ: "America/New_York" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
