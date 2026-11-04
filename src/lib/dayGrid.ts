// Раскладка задач со временем в сетке дня.
// Короткие (меньше часа или без длительности) лежат в ячейке часа начала, по порядку времени, и делят её поровну.
// Длинные (от часа) растягиваются на все часы, которых касаются: 9:00 на 1 ч — одна строка, 9:30 на 1 ч — две.
// Если блоки пересекаются, они встают рядом колонками; там, где соседей нет, блок занимает всю ширину.

interface Timed { id: string; start_time: string | null; estimate_minutes: number | null }
export interface ShortCell<T> { hour: number; tasks: T[]; col: number; span: number }
export interface LongBlock<T> { task: T; from: number; to: number; col: number; span: number }
export interface DayLayout<T> { columns: number; shorts: ShortCell<T>[]; longs: LongBlock<T>[] }

const startMinutes = (t: Timed) => { const [h, m] = (t.start_time ?? '00:00').split(':').map(Number); return h * 60 + m }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function layoutDay<T extends Timed>(tasks: T[], firstHour: number, lastHour: number): DayLayout<T> {
  const ordered = [...tasks].sort((a, b) => startMinutes(a) - startMinutes(b))
  const isLong = (t: T) => (t.estimate_minutes ?? 0) >= 60
  const shortByHour = new Map<number, T[]>()
  const longs: LongBlock<T>[] = []
  for (const t of ordered) {
    const start = startMinutes(t), from = clamp(Math.floor(start / 60), firstHour, lastHour)
    if (isLong(t)) longs.push({ task: t, from, to: clamp(Math.floor((start + t.estimate_minutes! - 1) / 60), from, lastHour), col: 0, span: 1 })
    else shortByHour.set(from, [...(shortByHour.get(from) ?? []), t])
  }

  // занятые колонки по часам
  const taken = new Map<number, Set<number>>()
  const isFree = (from: number, to: number, col: number) => { for (let h = from; h <= to; h++) if (taken.get(h)?.has(col)) return false; return true }
  const take = (from: number, to: number, col: number) => { for (let h = from; h <= to; h++) { if (!taken.has(h)) taken.set(h, new Set()); taken.get(h)!.add(col) } }

  // короткие там, где есть длинные, держат первую колонку, чтобы всегда стоять слева
  for (const h of shortByHour.keys()) if (longs.some(l => l.from <= h && h <= l.to)) take(h, h, 0)
  for (const l of longs) {
    while (!isFree(l.from, l.to, l.col)) l.col++
    take(l.from, l.to, l.col)
  }
  const columns = Math.max(1, ...longs.map(l => l.col + 1))
  const shorts: ShortCell<T>[] = [...shortByHour.entries()].sort((a, b) => a[0] - b[0]).map(([hour, list]) => {
    take(hour, hour, 0)
    return { hour, tasks: list, col: 0, span: 1 }
  })
  // свободное место справа отдаём блоку: без соседей он занимает всю ширину
  for (const l of longs) while (l.col + l.span < columns && isFree(l.from, l.to, l.col + l.span)) { take(l.from, l.to, l.col + l.span); l.span++ }
  for (const s of shorts) while (s.col + s.span < columns && isFree(s.hour, s.hour, s.col + s.span)) { take(s.hour, s.hour, s.col + s.span); s.span++ }
  return { columns, shorts, longs }
}
