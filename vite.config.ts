import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

/** Папка, в которой лежит сайт: «/» для своего домена, «/life-planner/» для GitHub Pages вида user.github.io/life-planner/ */
function basePath(raw: string | undefined): string {
  let b = (raw ?? '').trim() || '/'
  if (!b.startsWith('/')) b = '/' + b
  return b.endsWith('/') ? b : b + '/'
}

export default defineConfig(({ mode }) => {
  const base = basePath(loadEnv(mode, '.', '').VITE_BASE)
  return {
  base,
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
        name: 'My life planner',
        short_name: 'My life planner',
        lang: 'ru',
        display: 'standalone',
        background_color: '#F6F4EF',
        theme_color: '#1F6F6B',
        start_url: base,
        scope: base,
        id: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
}
})
