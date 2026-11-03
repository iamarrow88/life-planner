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
    if (app.postponeSheetId) return app.closePostponeSheet()
    if (app.editor) return app.closeEditor()
    if (app.detailId) return app.closeTask()
    if (app.habitDetailId) return app.closeHabit()
    if (app.searchQuery !== null) return app.closeSearch()
    if (canGoBack && router.currentRoute.value.path !== '/today') return router.back()
    void App.minimizeApp()
  })

  // Было ли приложение свёрнуто до нажатия на кнопку в уведомлении: если да, после действия сворачиваем его обратно
  let inBackground = false, lastActive = Date.now()
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) { inBackground = false; lastActive = Date.now() } else inBackground = true
  })
  /** Дождаться конца запуска и фоновых загрузок: их устаревший ответ затёр бы только что сделанное */
  const whenIdle = () => new Promise<void>(resolve => {
    const stop = watch(() => app.ready && !app.loading && !app.syncing, idle => {
      if (!idle) return
      queueMicrotask(() => stop())
      resolve()
    }, { immediate: true })
  })
  /** Кнопка в напоминании о задаче: выполнить, на завтра или открыть окно переноса */
  async function onTaskAction(actionId: string, taskId: string) {
    const fromBackground = inBackground || Date.now() - lastActive < 2500
    app.holdReloads = true
    try {
      await whenIdle()
      if (!app.user) return
      if (!app.data.tasks.some(t => t.id === taskId)) await app.load()
      const task = app.data.tasks.find(t => t.id === taskId)
      if (!task) { app.showNotice('Задача не найдена: возможно, её уже удалили'); return }
      if (actionId === reminders.ACTION_POSTPONE) { void router.push('/today'); app.openPostponeSheet(taskId); return }
      if (actionId === reminders.ACTION_DONE) {
        if (task.status !== 'done') await app.updateTask(taskId, { status: 'done' })
        if (app.error) return
        app.showNotice(`«${task.title}» выполнена`)
      } else {
        if (!(await app.postponeTask(taskId, reminders.ACTION_TOMORROW))) return
        app.showNotice(`«${task.title}» перенесена на завтра`)
      }
      // открылись только ради этого действия — возвращаем телефон туда, где он был
      if (fromBackground) void App.minimizeApp()
    } finally { app.holdReloads = false }
  }
  // нажали на уведомление: на кнопку — выполнить действие, на само уведомление — открыть нужный экран
  LocalNotifications.addListener('localNotificationActionPerformed', a => {
    const extra = a.notification.extra as { url?: string; taskId?: string } | undefined
    if (a.actionId !== 'tap' && extra?.taskId) { void onTaskAction(a.actionId, extra.taskId); return }
    if (extra?.url) void router.push(extra.url)
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
  App.addListener('resume', () => { if (app.user && !app.holdReloads) void app.load().then(resync) })
}
