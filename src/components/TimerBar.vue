<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApp, NUDGE_MINUTES } from '../stores/app'
import { fmtClock } from '../lib/time'

const app = useApp()
/** на каком 40-минутном шаге пользователь уже ответил «продолжаю» */
const ackStep = ref(0)
const step = computed(() => Math.floor(app.runningSeconds / 60 / NUDGE_MINUTES))
const showNudge = computed(() => !!app.running && step.value > ackStep.value)
watch(() => app.running?.id, () => { ackStep.value = 0 })
const router = useRouter()
/** Клик по баннеру: открыть то, на что идёт таймер — карточку задачи, привычки или страницу сферы */
/** Высота баннера → CSS-переменная --timer-h: другие липкие блоки (полоска дней в планировании) встают под ним */
const bar = ref<HTMLElement | null>(null)
const ro = new ResizeObserver(([e]) => setTimerH(e.target.getBoundingClientRect().height))
function setTimerH(h: number) { document.documentElement.style.setProperty('--timer-h', h + 'px') }
watch(bar, (el, old) => {
  if (old) ro.unobserve(old)
  if (el) ro.observe(el); else setTimerH(0)
})
onBeforeUnmount(() => { ro.disconnect(); setTimerH(0) })
function openRunning() {
  const r = app.running; if (!r) return
  if (r.task_id) app.openTask(r.task_id)
  else if (r.habit_id) app.openHabit(r.habit_id)
  else if (r.sphere_id) void router.push('/spheres/' + r.sphere_id)
}
</script>

<template>
  <!-- Идущий таймер: плавающая скруглённая «стеклянная» панель над содержимым экрана -->
  <div v-if="app.running" ref="bar" class="sticky top-0 z-20 px-3 pb-1.5 pt-3 md:px-8">
    <div class="glass mx-auto flex max-w-3xl items-center gap-3 rounded-2xl py-2 pl-4 pr-2" data-test="timer-bar">
      <span class="relative flex h-2.5 w-2.5 shrink-0"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/50"></span><span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent"></span></span>
      <button type="button" class="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:text-accent" :title="'Открыть: ' + app.runningTitle" data-test="timer-open" @click="openRunning">{{ app.runningTitle }} <span class="text-mute">›</span></button>
      <div class="text-base font-semibold tabular-nums text-accent-deep">{{ fmtClock(app.runningSeconds) }}</div>
      <button type="button" class="rounded-full bg-[#CFC9E8] px-3.5 py-1.5 text-sm font-semibold text-accent-deep hover:bg-[#C6BFE3]" @click="app.stopTimer()">Стоп</button>
    </div>
    <div v-if="app.forgotten" class="mx-auto mt-2 flex max-w-3xl items-center gap-3 rounded-2xl border border-red-100 bg-red-50/95 px-4 py-2 text-sm text-red-800">
      <span class="flex-1">Таймер идёт больше 3 часов — возможно, ты его забыла выключить.</span>
      <button class="font-semibold" @click="app.stopTimer()">Остановить</button>
    </div>
    <div v-else-if="showNudge" class="mx-auto mt-2 flex max-w-3xl items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/95 px-4 py-2 text-sm text-amber-900">
      <span class="flex-1">Таймер идёт уже {{ step * NUDGE_MINUTES }} мин. Всё ещё занимаешься этим?</span>
      <button class="font-semibold" @click="ackStep = step">Да</button>
      <button class="font-semibold text-red-700" @click="app.stopTimer()">Стоп</button>
    </div>
  </div>
</template>
