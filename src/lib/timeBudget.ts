// Два кольца учёта времени на экране «Сферы».
// План: весь круг — сумма целей, сектор сферы пропорционален её цели, цвет заполняет сектор по мере трат; сверх цели размер не меняется.
// Факт: весь круг — всё потраченное, сектор сферы пропорционален её времени.
// Длины дуг — доли круга (0…1).

export interface RingSphere { id: string; color: string; goal: number; spent: number }
/** cap — длина всего сектора: дуга заполнения упирается в его конец */
export interface Arc { key: string; color: string; from: number; len: number; cap: number }
export interface Ring { tint: Arc[]; solid: Arc[] }

/** Меньше 3° сектор не заметить и не нажать: такие поднимаем до минимума за счёт остальных */
const MIN_SHARE = 3 / 360
/** Заполнение от первой же траты должно быть видно */
const MIN_FILL = 0.005

/** Доли круга по значениям (все > 0) с учётом минимальной ширины */
export function ringShares(values: number[]): number[] {
  if (!values.length) return []
  if (values.length * MIN_SHARE >= 1) return values.map(() => 1 / values.length)
  const raised = new Set<number>()
  for (;;) {
    const rest = 1 - raised.size * MIN_SHARE
    const sum = values.reduce((s, v, i) => (raised.has(i) ? s : s + v), 0)
    const small = values.findIndex((v, i) => !raised.has(i) && (v / sum) * rest < MIN_SHARE)
    if (small < 0) return values.map((v, i) => (raised.has(i) ? MIN_SHARE : (v / sum) * rest))
    raised.add(small)
  }
}

export function planRing(spheres: RingSphere[]): Ring {
  const list = spheres.filter(s => s.goal > 0)
  const shares = ringShares(list.map(s => s.goal))
  const res: Ring = { tint: [], solid: [] }
  let pos = 0
  list.forEach((s, i) => {
    const len = shares[i]
    res.tint.push({ key: s.id, color: s.color, from: pos, len, cap: len })
    if (s.spent > 0) res.solid.push({ key: s.id, color: s.color, from: pos, len: Math.min(len, Math.max(MIN_FILL, (len * s.spent) / s.goal)), cap: len })
    pos += len
  })
  return res
}

export function factRing(spheres: RingSphere[]): Ring {
  const list = spheres.filter(s => s.spent >= 1)
  const shares = ringShares(list.map(s => s.spent))
  const res: Ring = { tint: [], solid: [] }
  let pos = 0
  list.forEach((s, i) => {
    res.solid.push({ key: s.id, color: s.color, from: pos, len: shares[i], cap: shares[i] })
    pos += shares[i]
  })
  return res
}
