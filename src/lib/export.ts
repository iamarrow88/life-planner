import type { ExportData } from '../types'
import { dayOf } from './time'

type Row = Record<string, unknown>
const rows = (d: ExportData, key: string): Row[] => (Array.isArray(d[key]) ? (d[key] as Row[]) : [])
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** CSV для Excel: разделитель «;», BOM (чтобы кириллица открылась правильно), переводы строк CRLF */
export function toCsv(header: string[], data: string[][]): string {
  const cell = (v: string) => (/[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return '﻿' + [header, ...data].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n'
}

export function download(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const clock = (iso: unknown) => { if (!iso) return ''; const d = new Date(String(iso)); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const STATUS: Record<string, string> = { inbox: 'Входящие', planned: 'Запланирована', done: 'Выполнена' }
const HABIT: Record<string, string> = { timer: 'Таймер', plain: 'Без таймера', counter: 'Счётчик' }

function names(d: ExportData) {
  const sph = new Map(rows(d, 'spheres').map(s => [str(s.id), str(s.name)]))
  const tsk = new Map(rows(d, 'tasks').map(t => [str(t.id), str(t.title)]))
  const hab = new Map(rows(d, 'habits').map(h => [str(h.id), str(h.name)]))
  return { sph, tsk, hab }
}

export function tasksCsv(d: ExportData): string {
  const { sph } = names(d)
  return toCsv(
    ['Название', 'Статус', 'Сфера', 'Дата', 'Время начала', 'План, мин', 'Выполнена', 'Создана'],
    rows(d, 'tasks').map(t => [
      str(t.title), STATUS[str(t.status)] ?? str(t.status), sph.get(str(t.sphere_id)) ?? '', str(t.due_date),
      str(t.start_time).slice(0, 5), str(t.estimate_minutes), t.done_at ? dayOf(str(t.done_at)) : '', t.created_at ? dayOf(str(t.created_at)) : '',
    ]),
  )
}

export function timeCsv(d: ExportData): string {
  const { sph, tsk, hab } = names(d)
  return toCsv(
    ['Дата', 'Начало', 'Конец', 'Минут', 'Что', 'Тип', 'Сфера', 'Источник'],
    rows(d, 'time_entries').map(e => {
      const started = new Date(str(e.started_at)).getTime()
      const minutes = e.ended_at ? Math.round((new Date(str(e.ended_at)).getTime() - started) / 60000) : ''
      const kind = e.task_id ? 'Задача' : e.habit_id ? 'Привычка' : 'Сфера'
      const what = e.task_id ? tsk.get(str(e.task_id)) : e.habit_id ? hab.get(str(e.habit_id)) : sph.get(str(e.sphere_id))
      return [dayOf(str(e.started_at)), clock(e.started_at), clock(e.ended_at), str(minutes), what ?? '', kind,
        sph.get(str(e.sphere_id)) ?? '', e.source === 'manual' ? 'вручную' : 'таймер']
    }),
  )
}

export function habitsCsv(d: ExportData): string {
  const { sph } = names(d)
  const habits = new Map(rows(d, 'habits').map(h => [str(h.id), h]))
  return toCsv(
    ['Дата', 'Привычка', 'Тип', 'Выполнено', 'Цель', 'Сфера'],
    rows(d, 'habit_entries').map(e => {
      const h = habits.get(str(e.habit_id))
      return [str(e.entry_date), str(h?.name), HABIT[str(h?.kind)] ?? '', str(e.value), str(h?.target_value), sph.get(str(h?.sphere_id)) ?? '']
    }),
  )
}
