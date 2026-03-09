import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Esto arregla el error de "Failed to resolve import @/..."
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
  '/api': {
    target: 'http://localhost:4000',
    changeOrigin: true,
    // NO uses rewrite si tu server.ts ya tiene "/api" en las rutas
    // rewrite: (path) => path.replace(/^\/api/, ''), 
      }
    }
  },
})