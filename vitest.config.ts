import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { resolve } from "path";

// No @vitejs/plugin-react needed: test files use no JSX, only renderHook (pure JS).
// Vitest's built-in esbuild handles TypeScript transforms.
export default defineConfig(({ mode }) => {
  // Merge .env (and .env.local, .env.test, etc.) into process.env so that
  // integration tests can read SUPABASE_* vars via process.env without dotenv.
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    test: {
      environment: "jsdom",
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
  };
});
