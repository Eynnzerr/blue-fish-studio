import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    base: "./",
    server: {
      proxy: {
        "/api/v1/stats": {
          target: env.STATS_PROXY_TARGET || "http://127.0.0.1:8787",
        },
      },
    },
  };
});
