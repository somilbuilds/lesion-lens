import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backendPort = process.env.BACKEND_PORT || process.env.VITE_BACKEND_PORT || '8000';
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);

// Keep browser requests same-origin during local development. Vite forwards
// API calls to FastAPI, avoiding localhost address-family and CORS issues.
export default defineConfig({
  plugins: [react()],
  server: {
    port: frontendPort,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
})
