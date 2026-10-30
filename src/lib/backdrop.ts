/**
 * Закрытие окна по подложке.
 * - Окно закрывается, только если кнопку мыши и нажали, и отпустили на подложке: выделение текста,
 *   начатое в окне и законченное за его пределами, окно не закрывает (браузер шлёт такой click подложке).
 * - isDirty — есть несохранённые изменения: тогда перед закрытием спрашиваем (и по подложке, и по ×).
 * В шаблоне: <div @pointerdown="bd.down" @click="bd.click">, кнопка × — @click="bd.close".
 */
export function useBackdrop(close: () => void, isDirty?: () => boolean) {
  let pressedOnBackdrop = false
  function tryClose() {
    if (isDirty?.() && !window.confirm('Закрыть без сохранения? Введённые изменения пропадут.')) return
    close()
  }
  return {
    down(e: PointerEvent) { pressedOnBackdrop = e.target === e.currentTarget },
    click(e: MouseEvent) {
      const onBackdrop = pressedOnBackdrop && e.target === e.currentTarget
      pressedOnBackdrop = false
      if (onBackdrop) tryClose()
    },
    close: tryClose,
  }
}
