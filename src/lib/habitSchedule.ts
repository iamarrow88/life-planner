import type { Habit, HabitSchedule, Recurrence } from '../types'
import { dayOf } from './time'
import { describe, matches, nextAfter } from './recurrence'

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
export const defaultSchedule = (startsOn: string | null = null): HabitSchedule => ({ freq: 'day', interval_n: 1, weekdays: [...ALL_DAYS], mode: 'schedule', starts_on: startsOn })

/** Расписание привычки в виде правила повтора (чтобы переиспользовать код повторяющихся задач) */
function rule(h: Partial<HabitSchedule>, startsOn: string): Recurrence {
  return { id: '', title: '', sphere_id: null, start_time: null, estimate_minutes: null, freq: h.freq ?? 'day', interval_n: h.interval_n ?? 1,
    weekdays: h.weekdays ?? ALL_DAYS, month_day: null, mode: h.mode ?? 'schedule', starts_on: startsOn, ends_on: null }
}
/** День начала расписания: заданный или день создания (повторяет habit_start из базы) */
export const habitStart = (h: Habit): string => h.starts_on ?? (h.created_at ? dayOf(h.created_at) : '0000-01-01')

/** Запланирована ли привычка на день d. lastDone — последний день до d, когда она была выполнена (повторяет habit_scheduled из базы) */
export function scheduledOn(h: Habit, d: string, lastDone: string | null): boolean {
  const start = habitStart(h)
  const r = rule(h, start)
  if (r.mode === 'schedule') return matches(r, d)
  const due = lastDone ? nextAfter(r, lastDone) : start
  return d >= (due > start ? due : start)
}
/** Срок: для «после выполнения» — дата, с которой привычка ждёт; для «по расписанию» — сегодня или ближайшая будущая дата */
export function dueOn(h: Habit, today: string, lastDone: string | null): string | null {
  const start = habitStart(h)
  const r = rule(h, start)
  if (r.mode === 'after_completion') { const due = lastDone ? nextAfter(r, lastDone) : start; return due > start ? due : start }
  for (let i = 0; i <= 4000; i++) {
    const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i)
    const s = d.toISOString().slice(0, 10)
    if (matches(r, s)) return s
  }
  return null
}
/** Словами: «Каждый день», «Пн, Ср, Пт», «Каждые 3 дня после выполнения» */
export function describeHabit(h: Partial<HabitSchedule>, startsOn = ''): string {
  return describe(rule(h, startsOn || '2000-01-03'))
}
