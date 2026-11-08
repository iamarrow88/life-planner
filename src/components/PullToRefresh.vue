<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { isNative } from '../lib/native'

/**
 * «Потяни вниз — обновится»: в приложении для телефона и в установленной PWA (в обычном браузере это делает сам браузер).
 * Срабатывает, только когда список прокручен до самого верха и нет открытых окон; жест с ручки ⋮⋮ (перетаскивание) не считается
 */
const props = defineProps<{ target: HTMLElement | null }>()
const app = useApp()
const logo = import.meta.env.BASE_URL + 'icon.svg'
const enabled = isNative || window.matchMedia('(display-mode: standalone)').matches
const THRESHOLD = 64, MAX = 110

const pull = ref(0)          // насколько опущен значок, px
const busy = ref(false)
const dragging = ref(false)  // палец на экране — значок идёт за ним без анимации
let startX = 0, startY = 0, tracking = false, pulling = false

const modalOpen = () => !!(app.detailId || app.habitDetailId || app.editor || app.searchQuery !== null || app.longStop)

function onStart(e: TouchEvent) {
  const el = props.target
  if (busy.value || !el || e.touches.length !== 1 || el.scrollTop > 0 || modalOpen()) return
  if ((e.target as Element).closest('[data-drag-handle], input, textarea, select, [data-no-pull]')) return
  startX = e.touches[0].clientX; startY = e.touches[0].clientY
  tracking = true; pulling = false
}
function onMove(e: TouchEvent) {
  if (!tracking) return
  const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY
  if (!pulling) {
    // решаем по первым пикселям: вбок или вверх — это не обновление
    if (Math.abs(dx) > Math.abs(dy) || dy < 0) { tracking = false; return }
    if (dy < 8) return
    pulling = true; dragging.value = true
  }
  if (props.target && props.target.scrollTop > 0) { tracking = false; pull.value = 0; return }
  e.preventDefault()                       // не прокручивать и не «тянуть» страницу, пока опускаем значок
  pull.value = Math.min(MAX, (dy - 8) * 0.5)
}
async function onEnd() {
  if (!tracking) return
  tracking = false; dragging.value = false
  if (!pulling || pull.value < THRESHOLD) { pull.value = 0; return }
  busy.value = true; pull.value = THRESHOLD * 0.85
  const started = Date.now()
  await app.refresh()
  // слишком быстрая вспышка выглядит как сбой — показываем вращение хотя бы полсекунды
  await new Promise(r => setTimeout(r, Math.max(0, 500 - (Date.now() - started))))
  busy.value = false; pull.value = 0
}

function bind(el: HTMLElement | null, old?: HTMLElement | null) {
  old?.removeEventListener('touchstart', onStart)
  old?.removeEventListener('touchmove', onMove)
  old?.removeEventListener('touchend', onEnd)
  old?.removeEventListener('touchcancel', onEnd)
  if (!el || !enabled) return
  el.addEventListener('touchstart', onStart, { passive: true })
  el.addEventListener('touchmove', onMove, { passive: false })
  el.addEventListener('touchend', onEnd)
  el.addEventListener('touchcancel', onEnd)
}
watch(() => props.target, (el, old) => bind(el, old), { immediate: true })
onBeforeUnmount(() => bind(null, props.target))
</script>

<template>
  <div v-if="enabled" class="pointer-events-none sticky top-0 z-30 h-0" aria-hidden="true">
    <div class="absolute left-1/2 top-0 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full bg-white/70 shadow-md"
      :class="!pull && !busy ? 'opacity-0' : 'opacity-100'"
      :style="{ transform: `translate(-50%, ${pull - 44}px)`, transition: dragging ? 'none' : 'transform .2s, opacity .2s' }" data-test="pull-refresh">
      <img :src="logo" alt="" class="h-7 w-7" :class="busy && 'animate-spin'"
        :style="busy ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / THRESHOLD) }" />
    </div>
  </div>
  <p v-if="busy" class="sr-only" role="status">Обновляю…</p>
</template>
