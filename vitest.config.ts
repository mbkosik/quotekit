import { defineConfig } from "vitest/config";
import { resolve } from "path";

// No @vitejs/plugin-react needed: test files use no JSX, only renderHook (pure JS).
// Vitest's built-in esbuild handles TypeScript transforms.
export default defineConfig({
  test: {
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
