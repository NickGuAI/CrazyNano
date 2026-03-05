import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Read API port from file (written by API server)
function getApiPort(): number {
  const portFile = path.resolve(__dirname, '../.api_port')
  try {
    return parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10)
  } catch {
    return 5000 // default
  }
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3100,
    strictPort: false,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${getApiPort()}`,
        changeOrigin: true,
      },
    },
  },
})
