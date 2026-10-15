import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Keep browser requests same-origin during local development. Vite forwards
// API calls to FastAPI, avoiding localhost address-family and CORS issues.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
