import type { Recurrence, Sphere, Task } from '../types'
import { addDays } from './time'
import { matches } from './recurrence'

/** Кружок в клетке месяца: сфера и сколько задач. kind — что считаем */
export interface DayMark {
  key: string
  color: string
  name: string
  count: number
  /** 'plan' — дела на сегодня/будущее, 'done' — выполненные в прошлом (бледно), 'overdue' — просроченные (бордовый), 'virtual' — дальние повторы (пунктир) */
  kind: 'plan' | 'done' | 'overdue' | 'virtual'
}
export interface DaySummary { marks: DayMark[]; minutes: number; label: string }

export const OVERDUE_COLOR = '#7A1F2B'
export const NO_SPHERE_COLOR = '#9CA3AF'
/** Задачи по повторам создаются в базе на 30 дней вперёд; дальше показываем их по правилу */
export const GENERATED_DAYS = 30

/**
 * Сводка по дням: кружки по сферам, минуты по оценкам невыполненных дел.
 * Прошлое — выполненные (бледно) и просроченные (бордовый); сегодня и будущее — невыполненные;
 * за горизонтом создания повторов — дела по правилам (пунктир)
 */
export function monthSummary(days: string[], today: string, tasks: Task[], recurrences: Recurrence[], spheres: Sphere[]): Map<string, DaySummary> {
  const sphere = new Map(spheres.map(s => [s.id, s]))
  const byDay = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.due_date || t.status === 'inbox') continue
    byDay.set(t.due_date, [...(byDay.get(t.due_date) ?? []), t])
  }
  const horizon = addDays(today, GENERATED_DAYS)
  const out = new Map<string, DaySummary>()
  for (const d of days) {
    const list = byDay.get(d) ?? []
    const groups = new Map<string, DayMark>()
    let minutes = 0
    const put = (sphereId: string | null, kind: DayMark['kind']) => {
      const key = kind + ':' + (sphereId ?? '')
      const s = sphereId ? sphere.get(sphereId) : undefined
      const g = groups.get(key) ?? { key, color: s?.color ?? NO_SPHERE_COLOR, name: s?.name ?? 'Без сферы', count: 0, kind }
      g.count++; groups.set(key, g)
    }
    let overdue = 0
    for (const t of list) {
      const done = t.status === 'done'
      if (d < today) { if (done) put(t.sphere_id, 'done'); else overdue++ }
      else if (!done) { put(t.sphere_id, 'plan'); minutes += t.estimate_minutes ?? 0 }
    }
    if (d > horizon) {
      for (const r of recurrences) {
        if (r.mode !== 'schedule' || !matches(r, d) || list.some(t => t.recurrence_id === r.id)) continue
        put(r.sphere_id, 'virtual'); minutes += r.estimate_minutes ?? 0
      }
    }
    const marks = [...groups.values()].sort((a, b) => b.count - a.count)
    if (overdue) marks.unshift({ key: 'overdue', color: OVERDUE_COLOR, name: 'Просрочено', count: overdue, kind: 'overdue' })
    const parts = marks.map(m => `${m.kind === 'done' ? 'выполнено, ' : m.kind === 'virtual' ? 'по повтору, ' : ''}${m.name} — ${m.count}`)
    if (minutes) parts.push(`≈ ${fmtLoad(minutes)}`)
    out.set(d, { marks, minutes, label: parts.join('; ') })
  }
  return out
}
/** «45 мин», «3 ч», «2,5 ч» — коротко для клетки */
export function fmtLoad(min: number): string {
  if (min < 60) return `${min} мин`
  const h = Math.round((min / 60) * 2) / 2
  return `${String(h).replace('.', ',')} ч`
}
