import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/codelens/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CodeLens',
        short_name: 'CodeLens',
        theme_color: '#7F77DD',
        background_color: '#0b1118',
        display: 'standalone',
        icons: [
          {
            src: '/codelens/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/codelens/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /assets\/.*(d3|analysis|index).*\.(js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'codelens-assets',
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/d3')) {
            return 'd3-chunk'
          }
          if (
            id.includes('/workers/') ||
            id.includes('analysis') ||
            id.includes('comlink')
          ) {
            return 'analysis-chunk'
          }
        },
      },
    },
    chunkSizeWarningLimit: 120,
  },
})
