// Справочник и отбор для фильмов (жанр и страна хранятся текстом, варианты — здесь)
import { ref } from 'vue'
import type { MovieStatus } from '../types'
import { ratingFits, within, type MinRating } from './rangeFilter'

/** Открытая карточка фильма. Общая для обоих списков: отметили «Посмотрела» — фильм переехал, карточка там же открыта */
export const openMovieId = ref<string | null>(null)

export const MOVIE_STATUSES: { v: MovieStatus; label: string }[] = [
  { v: 'queue', label: 'Хочу посмотреть' },
  { v: 'watched', label: 'Посмотрено' },
]

export const MOVIE_GENRES = [
  'Драма',
  'Комедия',
  'Мелодрама',
  'Боевик',
  'Триллер',
  'Детектив',
  'Криминал',
  'Ужасы',
  'Фантастика',
  'Фэнтези',
  'Приключения',
  'Исторический',
  'Военный',
  'Биография',
  'Мюзикл',
  'Семейный',
  'Мультфильм',
  'Аниме',
  'Документальный',
] as const

/** Подсказки для поля «Страна»; можно вписать любую */
export const MOVIE_COUNTRIES = [
  'Россия', 'СССР', 'Беларусь', 'США', 'Великобритания', 'Франция', 'Германия', 'Италия', 'Испания', 'Швеция', 'Дания', 'Норвегия',
  'Япония', 'Южная Корея', 'Китай', 'Индия', 'Канада', 'Австралия', 'Новая Зеландия', 'Мексика', 'Бразилия', 'Аргентина', 'Турция', 'Иран',
]

export interface MovieFilter {
  statuses: MovieStatus[]
  /** '' — любой, NO_VALUE — не указан */
  genre: string
  country: string
  minRating: MinRating
  yearFrom: string; yearTo: string
  addedFrom: string; addedTo: string
  watchedFrom: string; watchedTo: string
}
export const NO_VALUE = '-'
export const EMPTY_MOVIE_FILTER: MovieFilter = {
  statuses: [], genre: '', country: '', minRating: '', yearFrom: '', yearTo: '', addedFrom: '', addedTo: '', watchedFrom: '', watchedTo: '',
}
export function movieFilterCount(f: MovieFilter): number {
  return (f.statuses.length ? 1 : 0) + (f.genre ? 1 : 0) + (f.country ? 1 : 0) + (f.minRating ? 1 : 0)
    + [[f.yearFrom, f.yearTo], [f.addedFrom, f.addedTo], [f.watchedFrom, f.watchedTo]].filter(([a, b]) => a || b).length
}
const textFits = (want: string, v: string | null | undefined) => (want === NO_VALUE ? !v : !want || (v ?? '').toLowerCase() === want.toLowerCase())
export function matchesMovieFilter(f: MovieFilter, m: { status: MovieStatus; genre?: string | null; country?: string | null; rating: number | null; year: number | null; added_on?: string; watched_on: string | null }): boolean {
  if (f.statuses.length && !f.statuses.includes(m.status)) return false
  if (!textFits(f.genre, m.genre) || !textFits(f.country, m.country) || !ratingFits(f.minRating, m.rating)) return false
  return within(m.year, f.yearFrom, f.yearTo, true) && within(m.added_on, f.addedFrom, f.addedTo) && within(m.watched_on, f.watchedFrom, f.watchedTo)
}
