import type { Recurrence, Task } from '../types'
import { addDays } from './time'
import { matches } from './recurrence'
import { GENERATED_DAYS } from './monthMarks'

const whole = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'BYN', maximumFractionDigits: 0 })
const cents = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'BYN', minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** «1 500 BYN», «99,90 BYN» (копейки — только если они есть) */
export const fmtMoney = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? whole : cents).format(n)

export interface BudgetSum {
  total: number        // всё за период
  left: number         // по невыполненным
  overdue: number      // невыполненные с прошедшей датой (только для периода, который начинается сегодня)
  virtual: number      // повторы дальше 30 дней, задачи по которым ещё не созданы
  count: number        // задач с бюджетом
}
const amount = (t: { budget?: number | null }) => Number(t.budget ?? 0) || 0

/**
 * Сумма бюджетов задач с датой в [from, to]; noDate — вместо дат задачи без даты (и «Входящие»).
 * Дальние повторы (за горизонтом создания задач) считаются по правилу
 */
export function budgetSum(tasks: Task[], recurrences: Recurrence[], today: string, range: { from: string; to: string } | 'nodate'): BudgetSum {
  const s: BudgetSum = { total: 0, left: 0, overdue: 0, virtual: 0, count: 0 }
  const inRange = (t: Task) => (range === 'nodate' ? !t.due_date : !!t.due_date && t.due_date >= range.from && t.due_date <= range.to && t.status !== 'inbox')
  for (const t of tasks) {
    const a = amount(t); if (!a) continue
    if (inRange(t)) { s.total += a; s.count++; if (t.status !== 'done') s.left += a }
    else if (range !== 'nodate' && range.from === today && t.due_date && t.due_date < today && t.status !== 'done') s.overdue += a
  }
  if (range !== 'nodate') {
    const horizon = addDays(today, GENERATED_DAYS)
    for (let d = range.from > horizon ? range.from : addDays(horizon, 1); d <= range.to; d = addDays(d, 1)) {
      for (const r of recurrences) {
        const a = amount(r)
        if (!a || r.mode !== 'schedule' || !matches(r, d) || tasks.some(t => t.recurrence_id === r.id && t.due_date === d)) continue
        s.virtual += a; s.total += a; s.left += a; s.count++
      }
    }
  }
  return s
}
