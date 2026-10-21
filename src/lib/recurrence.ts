import type { Recurrence } from '../types'
import { addDays } from './time'

const dn = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000) }
const parts = (s: string) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d } }
const isodow = (s: string) => { const { y, m, d } = parts(s); return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1 }
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Подходит ли дата под правило (режим «по расписанию») — повторяет recurrence_matches из базы */
export function matches(r: Recurrence, d: string): boolean {
  if (d < r.starts_on || (r.ends_on && d > r.ends_on)) return false
  const n = r.interval_n
  const a = parts(d), b = parts(r.starts_on)
  switch (r.freq) {
    case 'day': return (dn(d) - dn(r.starts_on)) % n === 0
    case 'week': {
      if (!r.weekdays?.includes(isodow(d))) return false
      const weeks = ((dn(d) - (isodow(d) - 1)) - (dn(r.starts_on) - (isodow(r.starts_on) - 1))) / 7
      return weeks % n === 0
    }
    case 'month': {
      const months = (a.y * 12 + a.m) - (b.y * 12 + b.m)
      return months % n === 0 && a.d === Math.min(r.month_day ?? b.d, daysInMonth(a.y, a.m))
    }
    case 'year': return a.m === b.m && a.d === b.d && (a.y - b.y) % n === 0
  }
}

/** Следующая дата для режима «после выполнения» */
export function nextAfter(r: Recurrence, from: string): string {
  const n = r.interval_n
  if (r.freq === 'day') return addDays(from, n)
  if (r.freq === 'week') return addDays(from, 7 * n)
  const { y, m, d } = parts(from)
  const months = r.freq === 'month' ? n : 12 * n
  const t = m - 1 + months
  const ny = y + Math.floor(t / 12), nm = (t % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, daysInMonth(ny, nm))).padStart(2, '0')}`
}

const WD = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export function describe(r: Recurrence): string {
  const n = r.interval_n
  const unit = { day: ['день', 'дня', 'дней'], week: ['неделю', 'недели', 'недель'], month: ['месяц', 'месяца', 'месяцев'], year: ['год', 'года', 'лет'] }[r.freq]
  const every = n === 1
    ? { day: 'Каждый день', week: 'Каждую неделю', month: 'Каждый месяц', year: 'Каждый год' }[r.freq]
    : `Каждые ${n} ${n % 10 >= 2 && n % 10 <= 4 && (n < 12 || n > 14) ? unit[1] : unit[2]}`
  let s = r.mode === 'after_completion' ? `${every} после выполнения` : every
  if (r.freq === 'week' && r.weekdays?.length && r.mode === 'schedule') s = `${n === 1 ? '' : every + ': '}${[...r.weekdays].sort().map(i => WD[i]).join(', ')}`
  if (r.start_time) s += ` в ${r.start_time.slice(0, 5)}`
  return s
}
