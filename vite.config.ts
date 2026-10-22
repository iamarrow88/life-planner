import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest', // свой service worker (src/sw.ts) — нужен для push
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png}'] },
      devOptions: { enabled: true, type: 'module' }, // service worker и в npm run dev, чтобы проверять уведомления
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Планировщик',
        short_name: 'Планировщик',
        lang: 'ru',
        display: 'standalone',
        background_color: '#F6F4EF',
        theme_color: '#1F6F6B',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
})
