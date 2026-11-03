// Напоминания в приложении для телефона (Capacitor): ставятся в сам телефон через системные уведомления,
// поэтому приходят без интернета и без сервера. Правила те же, что у серверных push (planner_push.sql, planner_habit_push.sql):
//   * задача: (дата + время начала) − «напомнить за»; текст «Через N мин · 18:30» или «Пора начинать · 18:30»;
//   * привычка со временем (таблетки): в remind_at в дни окна активности, если сегодня ещё не отмечена; текст «Пора · 09:00»;
//   * таймер: раз в 40 минут «Всё ещё занимаешься этим?», после 3 часов — «Возможно, ты забыла его выключить»;
//   * итог недели: в воскресенье в 19:00, если итог этой недели не завершён.
// Расписание пересобирается при каждом изменении данных: всё старое снимается и ставится заново на 14 дней вперёд.
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { Habit, Task, TimeEntry } from '../types'
import { addDays, fmtMinutes, hhmm, weekStart } from './time'
import { FORGOTTEN_MINUTES, NUDGE_MINUTES } from '../stores/app'

const DAYS_AHEAD = 14
const CHANNEL = 'reminders'
const REVIEW_WEEKDAY = 0, REVIEW_TIME = '19:00' // как по умолчанию на сервере: воскресенье, 19:00

export interface ReminderInput {
  today: string
  tasks: Task[]
  habits: Habit[]
  running: TimeEntry | null
  runningTitle: string
  habitActiveOn: (h: Habit, day: string) => boolean
  habitIsDone: (h: Habit) => boolean
  reviewDone: boolean
}

/** id 1–99 — служебные (тестовые уведомления): пересборка расписания их не трогает */
const RESERVED_IDS = 100
/** id уведомления — 31-битное число из строкового ключа (задача, привычка+день…), не меньше RESERVED_IDS */
function idOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0
  return RESERVED_IDS + ((h & 0x7fffffff) % (0x7fffffff - RESERVED_IDS))
}
const at = (day: string, time: string) => new Date(`${day}T${time.length === 5 ? time + ':00' : time}`)

/** Все напоминания, которые должны стоять сейчас (только в будущем) */
export function plan(i: ReminderInput, now = Date.now()): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = []
  const push = (key: string, when: Date, title: string, body: string, url = '/today') => {
    if (when.getTime() <= now) return
    out.push({ id: idOf(key), title, body, schedule: { at: when, allowWhileIdle: true }, channelId: CHANNEL, extra: { url }, smallIcon: 'ic_stat_kola' })
  }
  const last = addDays(i.today, DAYS_AHEAD)

  for (const t of i.tasks) {
    if (t.status === 'done' || !t.due_date || !t.start_time || t.remind_before_minutes == null) continue
    if (t.due_date < i.today || t.due_date > last) continue
    const start = at(t.due_date, t.start_time)
    const before = t.remind_before_minutes
    push('task:' + t.id, new Date(start.getTime() - before * 60000), t.title, before > 0 ? `Через ${fmtMinutes(before)} · ${hhmm(t.start_time)}` : `Пора начинать · ${hhmm(t.start_time)}`)
  }

  for (const h of i.habits) {
    if (!h.remind_at) continue
    for (let d = i.today; d <= last; d = addDays(d, 1)) {
      if (!i.habitActiveOn(h, d)) continue
      if (d === i.today && i.habitIsDone(h)) continue
      push(`habit:${h.id}:${d}`, at(d, h.remind_at), h.name, `Пора · ${hhmm(h.remind_at)}`)
    }
  }

  if (i.running) {
    const start = new Date(i.running.started_at).getTime()
    for (let m = NUDGE_MINUTES; m < FORGOTTEN_MINUTES; m += NUDGE_MINUTES)
      push(`timer:${i.running.id}:${m}`, new Date(start + m * 60000), i.runningTitle, `Таймер идёт ${fmtMinutes(m)}. Всё ещё занимаешься этим?`)
    push(`timer:${i.running.id}:forgot`, new Date(start + FORGOTTEN_MINUTES * 60000), i.runningTitle, `Таймер идёт уже ${fmtMinutes(FORGOTTEN_MINUTES)}. Возможно, ты забыла его выключить.`)
  }

  // итог недели: ближайшее воскресенье этой недели (и следующей — на случай, если эта уже прошла)
  for (const ws of [weekStart(i.today), addDays(weekStart(i.today), 7)]) {
    if (ws === weekStart(i.today) && i.reviewDone) continue
    const sunday = addDays(ws, (REVIEW_WEEKDAY + 6) % 7)
    push('review:' + ws, at(sunday, REVIEW_TIME), 'Итог недели', 'Неделя заканчивается — время подвести итог и спланировать следующую.', '/review')
  }
  return out
}

let channelReady = false
async function ensureChannel() {
  if (channelReady) return
  await LocalNotifications.createChannel({ id: CHANNEL, name: 'Напоминания', description: 'Задачи, таблетки, таймер и итог недели', importance: 4, visibility: 1, vibration: true })
  channelReady = true
}

/** Снять все поставленные напоминания и поставить заново по текущим данным */
export async function syncReminders(i: ReminderInput): Promise<number> {
  const perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted') return 0
  await ensureChannel()
  const pending = await LocalNotifications.getPending()
  // снимаем только свои напоминания: тестовое уведомление, поставленное секунду назад, должно дойти
  const ours = pending.notifications.filter(n => n.id >= RESERVED_IDS)
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) })
  const list = plan(i)
  // Android держит не больше ~500 будущих будильников на приложение — берём ближайшие
  list.sort((a, b) => +a.schedule!.at! - +b.schedule!.at!)
  const top = list.slice(0, 400)
  if (top.length) await LocalNotifications.schedule({ notifications: top })
  return top.length
}

export type NativeNotifyState = 'granted' | 'denied' | 'prompt'
export async function notifyState(): Promise<NativeNotifyState> {
  const p = await LocalNotifications.checkPermissions()
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'
}
export async function requestNotify(): Promise<NativeNotifyState> {
  const p = await LocalNotifications.requestPermissions()
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'
}
/** Android 12+: «точные будильники» — без них напоминание может прийти с опозданием на несколько минут */
export async function exactAlarmsOn(): Promise<boolean> {
  try { return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted' } catch { return true }
}
export async function openExactAlarmSettings(): Promise<boolean> {
  try { return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === 'granted' } catch { return true }
}
/**
 * Проверка: delay = 0 — уведомление сразу (проверяет разрешение и канал),
 * delay > 0 — через будильник, как настоящие напоминания (проверяет, что телефон не откладывает их)
 */
export async function testNotification(delaySec = 0): Promise<void> {
  await ensureChannel()
  const n: LocalNotificationSchema = { id: delaySec ? 2 : 1, title: 'KolaApp', body: delaySec ? `Напоминание через ${delaySec} секунд пришло вовремя` : 'Так будут выглядеть напоминания', channelId: CHANNEL, smallIcon: 'ic_stat_kola', extra: { url: '/more' } }
  if (delaySec) n.schedule = { at: new Date(Date.now() + delaySec * 1000), allowWhileIdle: true }
  await LocalNotifications.schedule({ notifications: [n] })
}

/** Что мешает уведомлениям: для подсказки в «Ещё» */
export interface NotifyDiagnostics { permission: string; exact: boolean; channel: 'ok' | 'muted' | 'missing'; pending: number }
export async function diagnostics(): Promise<NotifyDiagnostics> {
  const permission = (await LocalNotifications.checkPermissions()).display
  const exact = await exactAlarmsOn()
  const ch = (await LocalNotifications.listChannels().catch(() => ({ channels: [] }))).channels.find(c => c.id === CHANNEL)
  // важность канала можно понизить в настройках Android: 0 — выключен, 1–2 — без звука и без всплывания
  const channel = !ch ? 'missing' : (ch.importance ?? 3) < 3 ? 'muted' : 'ok'
  const pending = (await LocalNotifications.getPending()).notifications.length
  return { permission, exact, channel, pending }
}
