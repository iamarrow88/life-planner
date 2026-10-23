// После сборки кладёт рядом с index.html копии 404.html и (для Netlify) _redirects.
// GitHub Pages не умеет «любой адрес → index.html», но для несуществующих страниц отдаёт 404.html —
// так обновление страницы на /life-planner/today открывает приложение, а не ошибку.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
if (!existsSync('dist/index.html')) { console.error('Нет dist/index.html — сначала vite build'); process.exit(1) }
copyFileSync('dist/index.html', 'dist/404.html')
writeFileSync('dist/_redirects', '/*  /index.html  200\n')   // Netlify
console.log('dist/404.html и dist/_redirects созданы')
