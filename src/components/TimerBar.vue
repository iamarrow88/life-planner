<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
function openRunning() {
  const r = app.running; if (!r) return
  if (r.task_id) app.openTask(r.task_id)
  else if (r.habit_id) app.openHabit(r.habit_id)
  else if (r.sphere_id) void router.push('/spheres/' + r.sphere_id)
}
</script>

<template>
  <div v-if="app.running" class="sticky top-0 z-10">
    <div class="flex items-center gap-3 bg-accent px-4 py-2.5 text-white">
      <span class="relative flex h-2.5 w-2.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70"></span><span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-white"></span></span>
      <button type="button" class="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline" :title="'Открыть: ' + app.runningTitle" data-test="timer-open" @click="openRunning">{{ app.runningTitle }} <span class="opacity-70">›</span></button>
      <div class="font-mono text-base font-semibold tabular-nums">{{ fmtClock(app.runningSeconds) }}</div>
      <button class="rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold hover:bg-white/30" @click="app.stopTimer()">Стоп</button>
    </div>
    <div v-if="app.forgotten" class="flex items-center gap-3 bg-red-50 px-4 py-2 text-sm text-red-800">
      <span class="flex-1">Таймер идёт больше 3 часов — возможно, ты его забыла выключить.</span>
      <button class="font-semibold" @click="app.stopTimer()">Остановить</button>
    </div>
    <div v-else-if="showNudge" class="flex items-center gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span class="flex-1">Таймер идёт уже {{ step * NUDGE_MINUTES }} мин. Всё ещё занимаешься этим?</span>
      <button class="font-semibold" @click="ackStep = step">Да</button>
      <button class="font-semibold text-red-700" @click="app.stopTimer()">Стоп</button>
    </div>
  </div>
</template>
