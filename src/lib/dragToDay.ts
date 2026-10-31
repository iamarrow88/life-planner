// Перетаскивание задачи на день календаря (мышь и палец), без внешних библиотек.
// Контейнер: строки с data-task-id, ручка внутри строки — элемент с data-drag-handle.
// Цель — любой элемент страницы с data-day; задержка над элементом с data-drag-month="-1|1" листает месяц.
export interface DragToDayOptions {
  /** Задачу отпустили над днём */
  drop(taskId: string, day: string): void
  /** Подержали над стрелкой месяца */
  shiftMonth(n: number): void
}
const HOVER_MS = 600

export function dragToDay(container: HTMLElement, getOpts: () => DragToDayOptions | undefined): () => void {
  type Drag = { id: string; ghost: HTMLElement; dx: number; dy: number; handle: Element; pointerId: number; over: HTMLElement | null; arrow: HTMLElement | null; arrowTimer?: number }
  let d: Drag | null = null

  function mark(el: HTMLElement | null) {
    if (!d || d.over === el) return
    d.over?.removeAttribute('data-drop-target')
    el?.setAttribute('data-drop-target', '')
    d.over = el
  }
  function down(e: PointerEvent) {
    if (d || (e.pointerType === 'mouse' && e.button !== 0)) return
    const handle = (e.target as HTMLElement).closest('[data-drag-handle]')
    const row = handle?.closest<HTMLElement>('[data-task-id]')
    if (!handle || !row || !container.contains(row)) return
    e.preventDefault()
    const r = row.getBoundingClientRect()
    // «призрак» строки следует за пальцем; сама строка остаётся на месте полупрозрачной
    const ghost = row.cloneNode(true) as HTMLElement
    Object.assign(ghost.style, {
      position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', zIndex: '50', pointerEvents: 'none',
      background: '#fff', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,.18)', opacity: '0.95',
    })
    document.body.appendChild(ghost)
    row.style.opacity = '0.4'
    d = { id: row.dataset.taskId!, ghost, dx: e.clientX - r.left, dy: e.clientY - r.top, handle, pointerId: e.pointerId, over: null, arrow: null }
    try { handle.setPointerCapture(e.pointerId) } catch { /* события придут и без захвата */ }
    handle.addEventListener('pointermove', move as EventListener)
    handle.addEventListener('pointerup', up as EventListener)
    handle.addEventListener('pointercancel', cancel as EventListener)
  }
  function move(e: PointerEvent) {
    if (!d || e.pointerId !== d.pointerId) return
    d.ghost.style.left = e.clientX - d.dx + 'px'
    d.ghost.style.top = e.clientY - d.dy + 'px'
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    mark(under?.closest<HTMLElement>('[data-day]') ?? null)
    const arrow = under?.closest<HTMLElement>('[data-drag-month]') ?? null
    if (arrow !== d.arrow) {
      window.clearInterval(d.arrowTimer)
      d.arrow = arrow
      // держим над стрелкой — месяцы листаются, пока палец там
      if (arrow) d.arrowTimer = window.setInterval(() => getOpts()?.shiftMonth(Number(arrow.dataset.dragMonth)), HOVER_MS)
    }
  }
  function end() {
    if (!d) return null
    const { id, over, handle, ghost } = d
    handle.removeEventListener('pointermove', move as EventListener)
    handle.removeEventListener('pointerup', up as EventListener)
    handle.removeEventListener('pointercancel', cancel as EventListener)
    try { handle.releasePointerCapture(d.pointerId) } catch { /* уже отпущен */ }
    window.clearInterval(d.arrowTimer)
    over?.removeAttribute('data-drop-target')
    ghost.remove()
    const row = container.querySelector<HTMLElement>(`[data-task-id="${id}"]`); if (row) row.style.opacity = ''
    d = null
    return { id, day: over?.dataset.day ?? null }
  }
  function up() { const r = end(); if (r?.day) getOpts()?.drop(r.id, r.day) }
  function cancel() { end() }
  container.addEventListener('pointerdown', down)
  return () => { container.removeEventListener('pointerdown', down); end() }
}
