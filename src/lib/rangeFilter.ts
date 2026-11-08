// Общее для фильтров списков (книги, фильмы)

/** Значение в промежутке [from, to]; пустой край — без ограничения. Если промежуток задан, а значения нет — не подходит */
export function within(v: string | number | null | undefined, from: string, to: string, num = false): boolean {
  if (!from && !to) return true
  if (v == null || v === '') return false
  const x = num ? Number(v) : String(v)
  return (!from || x >= (num ? Number(from) : from)) && (!to || x <= (num ? Number(to) : to))
}

/** Оценка: '' — любая, 'none' — без оценки, иначе — не ниже */
export type MinRating = '' | '5' | '4' | '3' | 'none'
export const RATING_CHOICES: { v: MinRating; label: string }[] = [{ v: '', label: 'Любая' }, { v: '5', label: '★5' }, { v: '4', label: '★4+' }, { v: '3', label: '★3+' }, { v: 'none', label: 'Без оценки' }]
export const ratingFits = (min: MinRating, rating: number | null) => (min === 'none' ? rating == null : !min || (rating ?? 0) >= Number(min))
