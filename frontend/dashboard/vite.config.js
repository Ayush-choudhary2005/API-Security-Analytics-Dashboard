import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'vendor-charts';
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) return 'vendor-map';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/socket.io-client')) return 'vendor-socket';
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/events': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/alerts': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/blocked': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/history': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/ingest': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
