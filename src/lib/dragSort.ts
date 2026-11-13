import type { Directive } from 'vue'

// Перетаскивание элементов списка за «ручку» (мышь и палец), без внешних библиотек.
// Контейнер: прямые потомки с data-id; ручка внутри потомка: любой элемент с data-drag-handle.
// getDrop — необязательно: отпустили над элементом с data-day (например, днём полосы недели) — вместо смены порядка вызывается он.
export function dragSort(container: HTMLElement, getCb: () => ((ids: string[]) => void) | undefined, getDrop?: () => ((id: string, day: string) => void) | undefined): () => void {
  type Drag = { el: HTMLElement; list: HTMLElement[]; rects: DOMRect[]; from: number; to: number; startY: number; handle: Element; pointerId: number; over: HTMLElement | null }
  let d: Drag | null = null
  const items = () => [...container.children].filter((x): x is HTMLElement => x instanceof HTMLElement && !!x.dataset.id)

  function clear() {
    if (!d) return
    for (const el of d.list) { el.style.transform = ''; el.style.transition = ''; el.style.zIndex = ''; el.style.position = ''; el.style.boxShadow = ''; el.style.background = ''; el.style.pointerEvents = '' }
    d.over?.removeAttribute('data-drop-target')
  }
  function down(e: PointerEvent) {
    if (d || (e.pointerType === 'mouse' && e.button !== 0)) return
    const handle = (e.target as HTMLElement).closest('[data-drag-handle]')
    const el = handle?.closest<HTMLElement>('[data-id]')
    if (!handle || !el || el.parentElement !== container) return
    e.preventDefault()
    const list = items()
    d = { el, list, rects: list.map(x => x.getBoundingClientRect()), from: list.indexOf(el), to: list.indexOf(el), startY: e.clientY, handle, pointerId: e.pointerId, over: null }
    try { handle.setPointerCapture(e.pointerId) } catch { /* ничего страшного: события придут и без захвата */ }
    for (const x of list) x.style.transition = x === el ? 'none' : 'transform 150ms'
    el.style.position = 'relative'; el.style.zIndex = '20'; el.style.background = '#fff'; el.style.boxShadow = '0 6px 18px rgba(0,0,0,.15)'
    // строка едет за пальцем и иначе закрывала бы собой день, над которым её держат
    if (getDrop) el.style.pointerEvents = 'none'
    handle.addEventListener('pointermove', move as EventListener)
    handle.addEventListener('pointerup', up as EventListener)
    handle.addEventListener('pointercancel', cancel as EventListener)
  }
  function move(e: PointerEvent) {
    if (!d || e.pointerId !== d.pointerId) return
    const dy = e.clientY - d.startY
    if (getDrop) {
      const day = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-day]') ?? null
      if (day !== d.over) { d.over?.removeAttribute('data-drop-target'); day?.setAttribute('data-drop-target', ''); d.over = day }
    }
    d.el.style.transform = `translateY(${dy}px)`
    const r = d.rects[d.from]
    const center = r.top + r.height / 2 + dy
    let to = 0
    d.rects.forEach((x, i) => { if (i !== d!.from && x.top + x.height / 2 < center) to++ })
    d.to = to
    d.list.forEach((el, i) => {
      if (i === d!.from) return
      el.style.transform = d!.from < to && i > d!.from && i <= to ? `translateY(${-r.height}px)` : d!.from > to && i < d!.from && i >= to ? `translateY(${r.height}px)` : ''
    })
  }
  function end() {
    if (!d) return null
    const { list, from, to, handle, el, over } = d
    handle.removeEventListener('pointermove', move as EventListener)
    handle.removeEventListener('pointerup', up as EventListener)
    handle.removeEventListener('pointercancel', cancel as EventListener)
    try { handle.releasePointerCapture(d.pointerId) } catch { /* уже отпущен */ }
    clear()
    d = null
    return { list, from, to, id: el.dataset.id!, day: over?.dataset.day ?? null }
  }
  function up() {
    const r = end(); if (!r) return
    if (r.day) { getDrop?.()?.(r.id, r.day); return }
    if (r.from === r.to) return
    const ids = r.list.map(x => x.dataset.id!)
    ids.splice(r.to, 0, ids.splice(r.from, 1)[0])
    getCb()?.(ids)
  }
  function cancel() { end() }
  container.addEventListener('pointerdown', down)
  return () => { container.removeEventListener('pointerdown', down); end() }
}

/** v-drag-sort="cb": перетаскивание за ручку; cb(ids) получает id в новом порядке (колбэк берётся свежий при каждом обновлении) */
export const vDragSort: Directive<HTMLElement & { _ds?: () => void; _cb?: (ids: string[]) => void }, (ids: string[]) => void> = {
  mounted(el, b) { el._cb = b.value; el._ds = dragSort(el, () => el._cb) },
  updated(el, b) { el._cb = b.value },
  unmounted(el) { el._ds?.() },
}
