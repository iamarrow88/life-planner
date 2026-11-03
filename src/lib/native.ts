// Приложение для телефона (Capacitor): то, что отличает его от сайта/PWA.
import { Capacitor } from '@capacitor/core'
import { watch } from 'vue'
import type { Router } from 'vue-router'
import type { useApp } from '../stores/app'
import { weekStart } from './time'

/** true — запущено как приложение для телефона (Android), а не в браузере */
export const isNative = Capacitor.isNativePlatform()

let resyncFn: (() => void) | null = null
/** Пересобрать расписание напоминаний сейчас (например, сразу после выдачи разрешения) */
export const resyncReminders = () => resyncFn?.()

export async function initNative(app: ReturnType<typeof useApp>, router: Router) {
  if (!isNative) return
  const [{ App }, { StatusBar, Style }, { LocalNotifications }, reminders] = await Promise.all([
    import('@capacitor/app'), import('@capacitor/status-bar'), import('@capacitor/local-notifications'), import('./nativeReminders'),
  ])

  // светлая полоса сверху, тёмные значки — как фон приложения
  StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  StatusBar.setBackgroundColor({ color: '#F6F4EF' }).catch(() => {})

  // «Назад» на Android: сначала закрыть открытое окно, потом вернуться по истории, на главном экране — свернуть приложение
  App.addListener('backButton', ({ canGoBack }) => {
    if (app.editor) return app.closeEditor()
    if (app.detailId) return app.closeTask()
    if (app.habitDetailId) return app.closeHabit()
    if (app.searchQuery !== null) return app.closeSearch()
    if (canGoBack && router.currentRoute.value.path !== '/today') return router.back()
    void App.minimizeApp()
  })

  // нажали на уведомление — открыть нужный экран
  LocalNotifications.addListener('localNotificationActionPerformed', a => {
    const url = (a.notification.extra as { url?: string } | undefined)?.url
    if (url) void router.push(url)
  })

  // напоминания пересобираются при любом изменении данных (с небольшой паузой, чтобы не дёргать систему на каждую букву)
  let timer: ReturnType<typeof setTimeout> | undefined
  const resync = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void reminders.syncReminders({
        today: app.today, tasks: app.data.tasks, habits: app.data.habits, running: app.running, runningTitle: app.runningTitle,
        habitActiveOn: app.habitActiveOn, habitIsDone: app.habitIsDone, reviewDone: !!app.reviewFor(weekStart(app.today))?.completed_at,
      }).catch(e => console.warn('reminders', e))
    }, 800)
  }
  resyncFn = resync
  watch(() => [app.data, app.today], resync, { deep: true, immediate: true })
  // вернулись в приложение: данные могли измениться на другом устройстве
  App.addListener('resume', () => { if (app.user) void app.load().then(resync) })
}
