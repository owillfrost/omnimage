import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { initializeBackend, createCatalogApiMiddleware } from './server/index'

function omnimageCatalogPlugin(): Plugin {
  return {
    name: 'omnimage-catalog-plugin',
    configureServer(server) {
      try {
        initializeBackend()
        const middleware = createCatalogApiMiddleware()
        server.middlewares.use((req, res, next) => {
          middleware(req, res, next)
        })
      } catch (err) {
        console.error('[Omnimage Catalog Plugin] Initialization error:', err)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    omnimageCatalogPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
})
