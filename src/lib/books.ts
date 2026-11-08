// Справочник для книг: состояния и жанры (жанр хранится текстом, список вариантов — здесь)
import { ref } from 'vue'
import type { BookStatus } from '../types'

/** Открытая карточка книги. Общая для всех списков: сменили состояние — книга переехала в другой раздел, карточка там же открыта */
export const openBookId = ref<string | null>(null)

export const BOOK_STATUSES: { v: BookStatus; label: string }[] = [
  { v: 'queue', label: 'Буду читать' },
  { v: 'reading', label: 'Читаю' },
  { v: 'done', label: 'Прочитано' },
  { v: 'dropped', label: 'Бросила' },
]

export const BOOK_GENRES = [
  'Фэнтези',
  'Фантастика',
  'Детектив',
  'Любовный роман',
  'Исторический роман',
  'Современная проза',
  'Классика',
  'Ужасы / Мистика',
  'Подростковая литература',
  'Поэзия / Драматургия',
  'Психология и саморазвитие',
  'Бизнес и финансы',
  'Научпоп / Наука',
  'Биографии',
  'Искусство и культура',
  'Здоровье и спорт',
  'Хобби и прикладная литература',
] as const

/** Отбор книг. Пустое значение — без ограничения. genre: '' — любой, NO_GENRE — без жанра; minRating: 'none' — без оценки */
export interface BookFilter {
  statuses: BookStatus[]
  genre: string
  minRating: '' | '5' | '4' | '3' | 'none'
  yearFrom: string; yearTo: string
  addedFrom: string; addedTo: string
  startedFrom: string; startedTo: string
  finishedFrom: string; finishedTo: string
}
export const NO_GENRE = '-'
export const EMPTY_BOOK_FILTER: BookFilter = {
  statuses: [], genre: '', minRating: '', yearFrom: '', yearTo: '', addedFrom: '', addedTo: '', startedFrom: '', startedTo: '', finishedFrom: '', finishedTo: '',
}
/** Сколько условий задано (для подписи на кнопке) */
export function bookFilterCount(f: BookFilter): number {
  return (f.statuses.length ? 1 : 0) + (f.genre ? 1 : 0) + (f.minRating ? 1 : 0)
    + [[f.yearFrom, f.yearTo], [f.addedFrom, f.addedTo], [f.startedFrom, f.startedTo], [f.finishedFrom, f.finishedTo]].filter(([a, b]) => a || b).length
}
/** Значение в промежутке [from, to]; пустой край — без ограничения. Если промежуток задан, а значения нет — не подходит */
const within = (v: string | number | null | undefined, from: string, to: string, num = false) => {
  if (!from && !to) return true
  if (v == null || v === '') return false
  const x = num ? Number(v) : String(v)
  return (!from || x >= (num ? Number(from) : from)) && (!to || x <= (num ? Number(to) : to))
}
export function matchesBookFilter(f: BookFilter, b: { status: BookStatus; genre?: string | null; rating: number | null; published_year?: number | null; added_on?: string; started_on: string | null; finished_on: string | null }): boolean {
  if (f.statuses.length && !f.statuses.includes(b.status)) return false
  if (f.genre === NO_GENRE ? !!b.genre : f.genre && b.genre !== f.genre) return false
  if (f.minRating === 'none' ? b.rating != null : f.minRating && (b.rating ?? 0) < Number(f.minRating)) return false
  return within(b.published_year, f.yearFrom, f.yearTo, true) && within(b.added_on, f.addedFrom, f.addedTo)
    && within(b.started_on, f.startedFrom, f.startedTo) && within(b.finished_on, f.finishedFrom, f.finishedTo)
}
