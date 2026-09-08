import path from "node:path"
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: true,
    allowedHosts: [
      '.ngrok-free.app',
      '.ngrok.io',
      'shopper-agent-mustard.ngrok-free.dev'
    ]
  }
})
