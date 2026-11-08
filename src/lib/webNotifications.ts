// Уведомления сайта (push с сервера, send-reminders) остаются в шторке, пока их не смахнут. Когда сайт открыт и данные
// свежие, убираем те, что уже не актуальны: задачу выполнили, перенесли или удалили, привычку отметили, таймер остановили,
// итог недели подвели. В приложении для телефона то же делает nativeReminders.ts.
import { watch } from 'vue'
import type { useApp } from '../stores/app'
import type { Task } from '../types'

export interface WebNotifyState {
  tasks: Task[]
  timerRunning: boolean
  /** undefined — такой привычки нет */
  habitDone: (id: string) => boolean | undefined
  reviewDone: boolean
}

/** Время напоминания задачи (местное), как его считает сервер; null — напоминать не о чем */
function remindAt(t: Task): number | null {
  if (t.status === 'done' || !t.due_date || !t.start_time || t.remind_before_minutes == null) return null
  const start = new Date(`${t.due_date}T${t.start_time.length === 5 ? t.start_time + ':00' : t.start_time}`).getTime()
  return start - t.remind_before_minutes * 60000
}

/** Теги уведомлений, которые пора убрать. Незнакомые теги не трогаем */
export function staleTags(tags: string[], s: WebNotifyState, now = Date.now()): string[] {
  return tags.filter(tag => {
    if (tag.startsWith('task-')) {
      const t = s.tasks.find(x => x.id === tag.slice(5))
      const at = t ? remindAt(t) : null
      // напоминание актуально, только если его время всё ещё наступило: перенесли на потом — убираем
      return at === null || at > now
    }
    if (tag.startsWith('habit-')) return s.habitDone(tag.slice(6)) !== false
    if (tag === 'timer') return !s.timerRunning
    if (tag === 'review') return s.reviewDone
    return false
  })
}

/** Следить за данными и убирать устаревшие уведомления сайта */
export function initWebNotificationCleanup(app: ReturnType<typeof useApp>, reviewDone: () => boolean) {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    // по данным из кэша или посреди загрузки не убираем: они могут быть устаревшими
    if (!app.user || !app.ready || app.loading || app.syncing || app.error || Notification.permission !== 'granted') return
    try {
      const reg = await navigator.serviceWorker.ready
      const shown = await reg.getNotifications()
      if (!shown.length) return
      const stale = new Set(staleTags(shown.map(n => n.tag).filter(Boolean), {
        tasks: app.data.tasks,
        timerRunning: !!app.running,
        habitDone: id => { const h = app.data.habits.find(x => x.id === id); return h ? app.habitIsDone(h) : undefined },
        reviewDone: reviewDone(),
      }))
      for (const n of shown) if (stale.has(n.tag)) n.close()
    } catch { /* не вышло — уберутся в следующий раз или вручную */ }
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => void run(), 800) }
  watch(() => [app.data, app.running, app.loading, app.syncing], soon, { deep: true, immediate: true })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon() })
}
