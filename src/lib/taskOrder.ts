import type { Task } from '../types'

/**
 * Свой порядок задач (перетаскиванием): задачи, которые ещё не двигали (position пусто), — первыми и в прежнем порядке
 * (сортировка устойчивая), затем — по position. 0 — «равны», чтобы следующий признак мог решить
 */
export function byPosition(a: Task, b: Task): number {
  const pa = a.position ?? null, pb = b.position ?? null
  if (pa === null && pb === null) return 0
  if (pa === null) return -1
  if (pb === null) return 1
  return pa - pb
}
