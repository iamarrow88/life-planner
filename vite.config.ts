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
    // Сборка для телефона (vite build --mode android): без viewport-fit=cover — Android сам оставляет место
    // под строку состояния и полосу навигации, и шапка не заходит под часы
    mode === 'android' && { name: 'android-viewport', transformIndexHtml: (html: string) => html.replace(', viewport-fit=cover', '') },
    VitePWA({
      strategies: 'injectManifest', // свой service worker (src/sw.ts) — нужен для push
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // шрифт: только кириллица и латиница (вьетнамский и прочие наборы браузер и так не скачает)
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png}', 'assets/onest-{cyrillic,latin}-*.woff2'] },
      devOptions: { enabled: true, type: 'module' }, // service worker и в npm run dev, чтобы проверять уведомления
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'KolaApp',
        short_name: 'KolaApp',
        lang: 'ru',
        display: 'standalone',
        background_color: '#E6E0FB',
        theme_color: '#6456B6',
        start_url: base,
        scope: base,
        id: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
}
})
