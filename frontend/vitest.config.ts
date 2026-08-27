import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Enforce coverage on the logic layer (API client, error mapping, auth
      // store, shared utils) where unit tests provide real signal. Page-level
      // components are covered by routing/smoke tests and are validated end to
      // end in the Docker CI job rather than chased for line coverage here.
      include: ["src/lib/**", "src/store/**"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
});
