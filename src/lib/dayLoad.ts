// Перегруженный день: пользователь сам оценивает сложность задачи, а лимиты условные и считаются по отдельности.
// Считаются все задачи дня, и выполненные тоже: силы на них уже ушли. Задачи без сложности не считаются.

export const COMPLEXITY_LEVELS = [
  { v: 1, label: 'Мелочь', many: 'мелочей', limit: 5 },
  { v: 2, label: 'Средняя', many: 'средних', limit: 2 },
  { v: 3, label: 'Большая', many: 'больших', limit: 1 },
] as const

export interface Overload { many: string; count: number; limit: number }

/** Превышения по дням: только дни, где превышен хотя бы один лимит. Порядок — от больших задач к мелочам */
export function dayOverloads(tasks: { due_date?: string | null; complexity?: number | null }[]): Map<string, Overload[]> {
  const counts = new Map<string, Record<number, number>>()
  for (const t of tasks) {
    if (!t.due_date || !t.complexity) continue
    const c = counts.get(t.due_date) ?? {}
    c[t.complexity] = (c[t.complexity] ?? 0) + 1
    counts.set(t.due_date, c)
  }
  const res = new Map<string, Overload[]>()
  for (const [day, c] of counts) {
    const over = [...COMPLEXITY_LEVELS].reverse().filter(l => (c[l.v] ?? 0) > l.limit).map(l => ({ many: l.many, count: c[l.v], limit: l.limit }))
    if (over.length) res.set(day, over)
  }
  return res
}
