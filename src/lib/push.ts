// Подписка устройства на push-уведомления (Web Push + VAPID)

export const vapidPublicKey = ((import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '').trim()

export type PushState = 'unsupported' | 'ios-install' | 'no-key' | 'denied' | 'off' | 'on'
export interface PushSubscriptionData { endpoint: string; p256dh: string; auth_key: string; user_agent: string }

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}
/** На iPhone/iPad уведомления работают только у приложения, добавленного на экран «Домой» */
export function needsIosInstall(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return ios && !standalone
}

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return needsIosInstall() ? 'ios-install' : 'unsupported'
  if (!vapidPublicKey) return 'no-key'
  if (Notification.permission === 'denied') return 'denied'
  return (await currentSubscription()) ? 'on' : 'off'
}

function toData(sub: PushSubscription): PushSubscriptionData {
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('Браузер вернул неполную подписку')
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth_key: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }
}

/** Спрашивает разрешение и подписывает это устройство. Возвращает данные для сохранения на сервере. */
export async function subscribePush(): Promise<PushSubscriptionData> {
  if (!pushSupported()) throw new Error('Этот браузер не поддерживает push-уведомления')
  if (!vapidPublicKey) throw new Error('Не задан VITE_VAPID_PUBLIC_KEY в .env')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }))
  return toData(sub)
}

/** Отписывает устройство, возвращает endpoint, чтобы удалить его и на сервере */
export async function unsubscribePush(): Promise<string | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return endpoint
}

/** Локальное тестовое уведомление: проверяет разрешение и service worker (сервер не нужен) */
export async function showTestNotification(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('My life planner', {
    body: 'Так будут выглядеть напоминания',
    icon: import.meta.env.BASE_URL + 'icon-192.png', badge: import.meta.env.BASE_URL + 'icon-192.png', tag: 'test', data: { url: '/more' },
  })
}
