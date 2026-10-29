<script setup lang="ts">
import { ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { fmtMinutes, shortDate, dayOf } from '../lib/time'

/** Окно после остановки очень долгого таймера (например, забытого на ночь): сразу предлагает указать реальное время */
const app = useApp()
const minutes = ref(30)
const busy = ref(false)
watch(() => app.longStop?.id, () => { minutes.value = 30 })
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
async function fix() {
  if (!(minutes.value > 0)) return
  busy.value = true
  await app.fixLongStop(minutes.value)
  busy.value = false
}
</script>

<template>
  <div v-if="app.longStop" class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-center" @click.self="app.dismissLongStop()">
    <form role="dialog" aria-label="Исправить время таймера" class="flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-bg p-5 md:rounded-3xl" @submit.prevent="fix">
      <h2 class="text-lg font-bold">Таймер шёл очень долго</h2>
      <p class="text-sm text-mute">
        «{{ app.longStop.title }}» — {{ fmtMinutes(Math.round(app.longStop.seconds / 60)) }}
        (с {{ shortDate(dayOf(app.longStop.started_at)) }}, {{ clock(app.longStop.started_at) }}). Если ты забыла его выключить, укажи, сколько времени заняло на самом деле.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button v-for="m in [15, 30, 60]" :key="m" type="button" class="chip py-1.5 text-sm" :class="minutes === m && 'chip-on'" @click="minutes = m">{{ m }} мин</button>
        <label class="flex items-center gap-2 text-sm text-mute">или
          <input v-model.number="minutes" type="number" min="1" :max="Math.round(app.longStop.seconds / 60)" class="input !w-24" aria-label="Минут" data-test="fix-minutes" /> мин
        </label>
      </div>
      <p class="text-xs text-mute">Время будет записано с начала таймера, в тот день, когда он был запущен. Позже его можно поправить в «⏱ время».</p>
      <div class="flex gap-2">
        <button class="btn-primary flex-1" :disabled="busy || !(minutes > 0)" data-test="fix-save">Записать {{ minutes > 0 ? fmtMinutes(Math.round(minutes)) : '' }}</button>
        <button type="button" class="btn-ghost" data-test="fix-keep" @click="app.dismissLongStop()">Оставить как есть</button>
      </div>
    </form>
  </div>
</template>
