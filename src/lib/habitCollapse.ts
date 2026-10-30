// Сворачивание списка привычек на «Сегодня»: пока невыполненных больше LIMIT, видно только первые LIMIT невыполненных,
// выполненные уезжают в «скрытые». Когда невыполненных стало LIMIT и меньше, остальные просто вычёркиваются на месте.
export const HABIT_LIMIT = 4

export interface CollapseState {
  day: string
  /** выполнены, когда невыполненных было больше LIMIT: прячутся */
  hidden: string[]
  /** выполнены, когда невыполненных уже было LIMIT и меньше: остаются на месте зачёркнутыми */
  kept: string[]
}
export const emptyCollapse = (day: string): CollapseState => ({ day, hidden: [], kept: [] })

/** Что поменялось в отметках: кто стал выполненным (прячем или оставляем по числу невыполненных до отметки), кто перестал */
export function nextCollapse(state: CollapseState, prevDone: Set<string>, nowDone: Set<string>, total: number, limit = HABIT_LIMIT): CollapseState {
  const hidden = new Set(state.hidden), kept = new Set(state.kept)
  for (const id of prevDone) if (!nowDone.has(id)) { hidden.delete(id); kept.delete(id) }
  let doneCount = [...prevDone].filter(id => nowDone.has(id)).length
  for (const id of nowDone) {
    if (prevDone.has(id)) continue
    const pendingBefore = total - doneCount
    if (total > limit && pendingBefore > limit) { hidden.add(id); kept.delete(id) } else { kept.add(id); hidden.delete(id) }
    doneCount++
  }
  return { day: state.day, hidden: [...hidden], kept: [...kept] }
}

/** order — id привычек в порядке показа; done — выполненные */
export function splitHabits(order: string[], done: Set<string>, state: CollapseState, limit = HABIT_LIMIT) {
  const pending = order.filter(id => !done.has(id))
  const doneIds = order.filter(id => done.has(id))
  const kept = new Set(state.kept), hidden = new Set(state.hidden)
  const total = order.length
  // выполненная привычка без отметки в состоянии (сделана на другом устройстве / до обновления): прячем, если привычек больше LIMIT
  const isHidden = (id: string) => (kept.has(id) ? false : hidden.has(id) ? true : total > limit)
  if (pending.length > limit) {
    return { visible: pending.slice(0, limit), queued: pending.slice(limit), hiddenDone: doneIds }
  }
  const hiddenDone = doneIds.filter(isHidden)
  const hiddenSet = new Set(hiddenDone)
  return { visible: order.filter(id => !hiddenSet.has(id)), queued: [] as string[], hiddenDone }
}
