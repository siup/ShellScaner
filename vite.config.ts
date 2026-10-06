/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base './' keeps the build working from any sub-path (GitHub Pages etc.)
export default defineConfig({
  base: './',
  build: {
    // ZXing is big, but everything is precached once, so one chunk is fine
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Shell Serial Scanner',
        short_name: 'Shell Scanner',
        description: 'Offline barcode scanner for prefab / shell serial numbers',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        background_color: '#f2f2f7',
        theme_color: '#f2f2f7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // ocr/ holds the Tesseract engine (~4 MB) and English model (~3 MB),
        // assets/ the zxing-cpp barcode reader (~1 MB wasm)
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,gz,wasm}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
