import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev: Vite on :5173 proxies /api to FastAPI on :8000. Prod: FastAPI serves dist/.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } } },
  build: { sourcemap: false },
});
