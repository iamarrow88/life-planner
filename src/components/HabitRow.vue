<script setup lang="ts">
import { computed } from 'vue'
import { useApp } from '../stores/app'
import type { Habit } from '../types'
import { entrySeconds, shortDate } from '../lib/time'
import { describeHabit } from '../lib/habitSchedule'

const props = defineProps<{ habit: Habit }>()
const app = useApp()
const sphere = computed(() => app.sphereById(props.habit.sphere_id))
const target = computed(() => props.habit.target_value ?? 1)

const timerMinutes = computed(() => {
  let sec = 0
  for (const e of app.data.timeEntries) {
    if (e.habit_id !== props.habit.id) continue
    const d = new Date(e.started_at)
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (day === app.today) sec += entrySeconds(e, app.now)
  }
  return Math.floor(sec / 60)
})
const value = computed(() => (props.habit.kind === 'timer' ? timerMinutes.value : app.habitValue(props.habit.id)))
const done = computed(() => value.value >= target.value)
const isRunning = computed(() => app.running?.habit_id === props.habit.id)
const status = computed(() => app.habitStatusOf(props.habit.id))
/** Подпись про расписание: когда следующий раз или с какого дня привычка ждёт */
const note = computed(() => {
  const st = status.value
  if (!st.scheduled) return st.due ? `следующий раз: ${shortDate(st.due)}` : ''
  if (props.habit.mode === 'after_completion' && st.due && st.due < app.today && !done.value) return `ждёт с ${shortDate(st.due)}`
  return ''
})
const late = computed(() => status.value.scheduled && !!note.value)
const custom = computed(() => (props.habit.freq ?? 'day') !== 'day' || (props.habit.interval_n ?? 1) > 1 || props.habit.mode === 'after_completion')
const pct = computed(() => Math.min(100, Math.round((value.value / target.value) * 100)))
</script>

<template>
  <div class="flex items-center gap-3 px-3 py-2.5">
    <!-- Без таймера: одно нажатие -->
    <button v-if="habit.kind === 'plain'" class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition"
      :class="done ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'"
      @click="app.bumpHabit(habit, done ? -1 : 1)">
      <svg v-if="done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
    </button>
    <span v-else class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
      :class="done ? 'bg-accent text-white' : 'bg-accent-soft text-accent'">{{ done ? '✓' : habit.kind === 'timer' ? '⏱' : '#' }}</span>

    <div class="min-w-0 flex-1">
      <button type="button" class="block max-w-full truncate text-left text-[15px] hover:text-accent" title="Редактировать привычку" :aria-label="'Редактировать привычку: ' + habit.name" @click="app.openHabit(habit.id)">{{ habit.name }}</button>
      <div class="mt-0.5 flex items-center gap-2 text-xs text-mute">
        <span v-if="sphere" class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full" :style="{ background: sphere.color }"></span>{{ sphere.name }}</span>
        <span v-if="custom" data-test="habit-repeat">↻ {{ describeHabit(habit) }}</span>
        <span v-if="note" :class="late && 'text-amber-700'" data-test="habit-note">{{ note }}</span>
        <span v-if="habit.kind === 'counter'">{{ value }} / {{ target }}</span>
        <span v-else-if="habit.kind === 'timer'">{{ value }} / {{ target }} мин</span>
      </div>
      <div v-if="habit.kind !== 'plain'" class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div class="h-full rounded-full transition-all" :style="{ width: pct + '%', background: sphere?.color ?? '#1F6F6B' }"></div>
      </div>
    </div>

    <button v-if="habit.kind === 'timer'" class="shrink-0 text-xs font-semibold text-mute hover:text-accent" @click="app.openEditor({ habit_id: habit.id }, habit.name)">⏱ время</button>
    <div v-if="habit.kind === 'counter'" class="flex items-center gap-1">
      <button class="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-lg text-accent disabled:opacity-40" :disabled="value <= 0" @click="app.bumpHabit(habit, -1)">−</button>
      <button class="grid h-8 w-8 place-items-center rounded-full bg-accent text-lg text-white disabled:opacity-40" :disabled="done" @click="app.bumpHabit(habit, 1)">+</button>
    </div>
    <button v-else-if="habit.kind === 'timer'" class="grid h-9 w-9 shrink-0 place-items-center rounded-full transition"
      :class="isRunning ? 'bg-accent text-white' : 'bg-accent-soft text-accent'"
      @click="isRunning ? app.stopTimer() : app.startTimer({ habit_id: habit.id })">
      <svg v-if="isRunning" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
    </button>
  </div>
</template>
