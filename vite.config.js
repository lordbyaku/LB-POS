import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'LB POS INDONESIA',
        short_name: 'LB POS',
        description: 'Sistem Kasir Laundry Profesional',
        theme_color: '#090b14',
        background_color: '#030407',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/3003/3003984.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://cdn-icons-png.flaticon.com/512/3003/3003984.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
