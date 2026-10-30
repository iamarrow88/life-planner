// Кольцо «бюджета времени»: всё кольцо — время, которое остаётся после сна, текучки и работы.
// Оно делится между сферами по их целям; остаток — «не распределено».
// Факт закрашивает сектор своей сферы; сверх цели (и у сфер без цели) — сначала нераспределённую часть,
// а когда и она кончилась — внешнее тонкое кольцо «перебор».

export interface BudgetSphere { id: string; color: string; goal: number; spent: number }
/** Дуга в минутах: from — где начинается, len — длина */
export interface Arc { key: string; color: string; from: number; len: number }
export interface BudgetRing {
  plan: Arc[]          // сектора сфер по целям (бледные)
  free: Arc | null     // нераспределённое время
  fact: Arc[]          // учтённое время (яркое)
  over: Arc[]          // перебор: внешнее кольцо
  overGoals: boolean   // целей больше, чем свободного времени (сектора ужаты пропорционально)
}

export function budgetRing(capacity: number, spheres: BudgetSphere[]): BudgetRing {
  const res: BudgetRing = { plan: [], free: null, fact: [], over: [], overGoals: false }
  if (capacity <= 0) return res
  const sumGoals = spheres.reduce((s, x) => s + Math.max(0, x.goal), 0)
  res.overGoals = sumGoals > capacity
  const scale = res.overGoals ? capacity / sumGoals : 1

  let pos = 0
  const extra: { id: string; color: string; len: number }[] = []
  for (const s of spheres) {
    const g = Math.max(0, s.goal) * scale
    const spent = Math.max(0, s.spent)
    const fill = Math.min(spent, g)
    if (g > 0) res.plan.push({ key: s.id, color: s.color, from: pos, len: g })
    if (fill > 0) res.fact.push({ key: s.id, color: s.color, from: pos, len: fill })
    if (spent > fill) extra.push({ id: s.id, color: s.color, len: spent - fill })
    pos += g
  }
  const freeLen = Math.max(0, capacity - pos)
  if (freeLen > 0) res.free = { key: 'free', color: '', from: pos, len: freeLen }

  let freePos = pos, freeLeft = freeLen, overPos = 0
  for (const e of extra) {
    const inFree = Math.min(e.len, freeLeft)
    if (inFree > 0) { res.fact.push({ key: e.id + ':free', color: e.color, from: freePos, len: inFree }); freePos += inFree; freeLeft -= inFree }
    const rest = Math.min(e.len - inFree, capacity - overPos)
    if (rest > 0) { res.over.push({ key: e.id, color: e.color, from: overPos, len: rest }); overPos += rest }
  }
  return res
}
