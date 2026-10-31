import type { CycleDay, CycleSettings, NewPillCourse, PillCourse } from '../types'
import { addDays } from './time'

export const DEFAULT_CYCLE_SETTINGS: CycleSettings = {
  link_label: 'День цикла', sphere_id: null, course_from_day: 1, course_days: 21,
  morning_time: '09:00:00', evening_time: '21:00:00', morning_habit_id: null, evening_habit_id: null,
}
export const PILL_NAMES = { morning: 'Таблетка · утро', evening: 'Таблетка · вечер' } as const

const dn = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000) }
export const daysBetween = (a: string, b: string) => dn(b) - dn(a)

/** Первые дни циклов по возрастанию */
export const cycleStarts = (days: CycleDay[]) => days.filter(d => d.cycle_start).map(d => d.day).sort()
/** Начало цикла, в который попадает день d (последний «первый день» не позже d) */
export function startOf(d: string, starts: string[]): string | null {
  let r: string | null = null
  for (const s of starts) if (s <= d) r = s
  return r
}
/** Номер дня цикла (1 — первый день) или null, если цикл ещё не отмечен */
export function cycleDayNo(d: string, starts: string[]): number | null {
  const s = startOf(d, starts)
  return s ? daysBetween(s, d) + 1 : null
}
/** Курс по схеме «с N-го дня цикла, M дней» */
export function courseFrom(cycleStart: string, fromDay: number, days: number): NewPillCourse {
  const starts_on = addDays(cycleStart, fromDay - 1)
  return { kind: 'cycle', cycle_start: cycleStart, from_day: fromDay, days, starts_on, ends_on: addDays(starts_on, days - 1) }
}
export const courseOn = (d: string, courses: PillCourse[]) => courses.find(c => c.starts_on <= d && d <= c.ends_on) ?? null

// ---- История циклов
export type Dose = 'morning' | 'evening'
export interface PillMark { day: string; dose: Dose; taken: boolean }
export interface MissedDose { day: string; dose: Dose; time: string }
export interface CycleRecord {
  start: string
  end: string | null          // null — цикл ещё идёт
  length: number              // дней (у текущего — сколько прошло, включая сегодня)
  periodDays: string[]
  course: PillCourse | null
  missed: MissedDose[]
  notes: { day: string; note: string }[]
  summary: string | null      // примечание ко всему циклу
}
/** Пропущенная доза засчитывается, когда со времени приёма прошло больше 2 часов (как окно напоминания) */
const GRACE_MIN = 120
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/**
 * Циклы от новых к старым: даты, дни менструации, курс таблеток, пропущенные дозы, заметки.
 * Заметки до первого отмеченного цикла — отдельно (loose)
 */
export function cycleHistory(p: {
  days: CycleDay[]; courses: PillCourse[]; marks: PillMark[]; today: string; nowMin: number; times: Record<Dose, string>
}): { cycles: CycleRecord[]; loose: { day: string; note: string }[] } {
  const starts = cycleStarts(p.days)
  const taken = new Set(p.marks.filter(m => m.taken).map(m => m.day + ':' + m.dose))
  const notesIn = (a: string, b: string | null) => p.days.filter(d => d.note && d.day >= a && (!b || d.day <= b)).sort((x, y) => x.day.localeCompare(y.day)).map(d => ({ day: d.day, note: d.note! }))
  const cycles = starts.map((start, i): CycleRecord => {
    const end = i + 1 < starts.length ? addDays(starts[i + 1], -1) : null
    const last = end ?? p.today
    const course = p.courses.find(c => c.cycle_start === start) ?? p.courses.find(c => c.starts_on >= start && c.starts_on <= last) ?? null
    const missed: MissedDose[] = []
    if (course) {
      const until = course.ends_on < p.today ? course.ends_on : p.today
      for (let d = course.starts_on; d <= until; d = addDays(d, 1)) {
        for (const dose of ['morning', 'evening'] as const) {
          if (d === p.today && p.nowMin < toMin(p.times[dose]) + GRACE_MIN) continue // сегодняшняя доза ещё не просрочена
          if (!taken.has(d + ':' + dose)) missed.push({ day: d, dose, time: p.times[dose].slice(0, 5) })
        }
      }
    }
    return {
      start, end, length: daysBetween(start, last) + 1, course, missed, notes: notesIn(start, end),
      summary: p.days.find(d => d.day === start)?.cycle_note ?? null,
      periodDays: p.days.filter(d => d.period && d.day >= start && d.day <= last).map(d => d.day).sort(),
    }
  }).reverse()
  const loose = starts.length ? p.days.filter(d => d.note && d.day < starts[0]).map(d => ({ day: d.day, note: d.note! })).sort((a, b) => a.day.localeCompare(b.day)) : notesIn('0000-01-01', null)
  return { cycles, loose }
}
/** Подряд идущие дни — отрезками: [['2026-10-03','2026-10-07'], …] */
export function dayRanges(days: string[]): [string, string][] {
  const r: [string, string][] = []
  for (const d of [...days].sort()) {
    const lastRange = r.at(-1)
    if (lastRange && addDays(lastRange[1], 1) === d) lastRange[1] = d
    else r.push([d, d])
  }
  return r
}
