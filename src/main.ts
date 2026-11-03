import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { isNative } from './lib/native'
import { router } from './router'
// Шрифт Onest лежит в самом приложении: не ждём Google Fonts при каждом запуске и работаем без интернета
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/onest/700.css'
import './style.css'

// В приложении для телефона service worker не нужен: файлы и так лежат внутри приложения, а напоминания — системные
if (!isNative) registerSW({ immediate: true })
// Вышла новая версия: как только она взяла управление, перезагружаем страницу, чтобы телефон не сидел на старой сборке
if (!isNative && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload() } })
}
createApp(App).use(createPinia()).use(router).mount('#app')
