import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['humaniste_favicon_circle.svg'],
      manifest: {
        name: 'BunfreeChat',
        short_name: 'Bunfree',
        description: 'BunfreeChat アプリケーション',
        theme_color: '#4a90e2',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}']
      }
    })
  ],
  server: {
    port: 5174,
    // CORS問題を解決するために必要なら以下を追加
    cors: true
  }
})
