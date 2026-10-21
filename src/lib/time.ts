const pad = (n: number) => String(n).padStart(2, '0')

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = () => ymd(new Date())

export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  return ymd(new Date(y, m - 1, d + n))
}
/** Понедельник недели, в которую попадает день s */
export function weekStart(s: string = todayStr()): string {
  const [y, m, d] = s.split('-').map(Number)
  const wd = (new Date(y, m - 1, d).getDay() + 6) % 7 // 0 = Пн
  return addDays(s, -wd)
}
export const monthStart = (s: string = todayStr()) => s.slice(0, 8) + '01'
/** Локальный день (YYYY-MM-DD) момента времени */
export const dayOf = (iso: string) => ymd(new Date(iso))
/** Сколько секунд длится запись (для запущенной — до now) */
export function entrySeconds(e: { started_at: string; ended_at: string | null }, now = Date.now()): number {
  const end = e.ended_at ? new Date(e.ended_at).getTime() : now
  return Math.max(0, Math.floor((end - new Date(e.started_at).getTime()) / 1000))
}
export function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  if (!h) return `${m} мин`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const WEEKDAYS = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота']
export function longDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTHS[m - 1]}`
}
export function shortDate(s: string): string {
  const [, m, d] = s.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}
/** Минуты для коротких отрезков: «<1 мин» вместо «0 мин» */
export const fmtSec = (sec: number) => (sec > 0 && sec < 60 ? '<1 мин' : fmtMinutes(Math.floor(sec / 60)))
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')
