// Service worker: кэш приложения (оффлайн-оболочка) + push-уведомления.
// Собирается vite-plugin-pwa в режиме injectManifest.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

// Минимальные типы: lib «webworker» конфликтует с «dom» в общем tsconfig
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const self: any

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// Переходы по адресам приложения (/today, /review …) отдают index.html
if (!import.meta.env.DEV) registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Папка сайта (например, https://user.github.io/life-planner/) — она же область действия service worker
const BASE: string = self.registration.scope
const inApp = (path: string) => new URL(path.replace(/^\//, ''), BASE).href

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event: { waitUntil(p: Promise<unknown>): void }) => event.waitUntil(self.clients.claim()))

// Пришло push-сообщение с сервера (Edge Function send-reminders)
self.addEventListener('push', (event: { data?: { json(): unknown; text(): string }; waitUntil(p: Promise<unknown>): void }) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {}
  try { data = (event.data?.json() as typeof data) ?? {} } catch { data = { body: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'My life planner', {
    body: data.body,
    icon: inApp('icon-192.png'),
    badge: inApp('icon-192.png'),
    data: { url: data.url || '/' },
    // одинаковый tag заменяет прошлое уведомление (например, таймер) вместо стопки
    ...(data.tag ? { tag: data.tag, renotify: true } : {}),
  }))
})

// Нажали на уведомление: открыть/показать приложение на нужном экране
self.addEventListener('notificationclick', (event: { notification: { close(): void; data?: { url?: string } }; waitUntil(p: Promise<unknown>): void }) => {
  event.notification.close()
  const url = inApp(event.notification.data?.url || '/')
  event.waitUntil((async () => {
    const wins: { focus(): Promise<unknown>; navigate?(u: string): Promise<unknown> }[] =
      await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.length) {
      await wins[0].focus()
      if (wins[0].navigate) await wins[0].navigate(url).catch(() => undefined)
      return
    }
    await self.clients.openWindow(url)
  })())
})
