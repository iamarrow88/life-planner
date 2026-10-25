import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { router } from './router'
import './style.css'

registerSW({ immediate: true })
// Вышла новая версия: как только она взяла управление, перезагружаем страницу, чтобы телефон не сидел на старой сборке
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload() } })
}
createApp(App).use(createPinia()).use(router).mount('#app')
