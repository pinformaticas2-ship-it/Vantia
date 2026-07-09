import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    // Vercel inyecta VERCEL_GIT_COMMIT_SHA en el entorno de build (no en el runtime del
    // navegador), así que hay que capturarlo aquí y "quemarlo" en el bundle en build time.
    __APP_COMMIT__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || "dev"),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "localhost",
    port: 5173,
    strictPort: true,
  },
});
