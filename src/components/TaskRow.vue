<script setup lang="ts">
import { computed } from 'vue'
import { useApp } from '../stores/app'
import type { Task } from '../types'
import { fmtClock, fmtSec, hhmm } from '../lib/time'
import { fmtMinutes } from '../lib/time'

const props = defineProps<{ task: Task }>()
const app = useApp()
const sphere = computed(() => app.sphereById(props.task.sphere_id))
const isRunning = computed(() => app.running?.task_id === props.task.id)
const done = computed(() => props.task.status === 'done')
const totals = computed(() => app.taskTotals[props.task.id] ?? { week: 0, month: 0 })
const liveSeconds = computed(() => (isRunning.value ? app.runningSeconds : 0))
</script>

<template>
  <div class="flex items-center gap-3 px-3 py-2.5">
    <button class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition"
      :class="done ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'"
      :aria-label="done ? 'Вернуть в работу' : 'Выполнено'" @click="app.toggleDone(task)">
      <svg v-if="done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
    </button>
    <div class="min-w-0 flex-1">
      <button class="block w-full truncate text-left text-[15px] hover:text-accent" :class="done && 'text-mute line-through'" @click="app.openTask(task.id)">{{ task.title }}</button>
      <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
        <span v-if="task.recurrence_id" title="Повторяющаяся" class="font-semibold text-accent">↻</span>
        <span v-if="task.start_time" class="font-medium text-ink/70">{{ hhmm(task.start_time) }}<span v-if="task.remind_before_minutes != null" title="Напомнит"> 🔔</span></span>
        <span v-if="sphere" class="inline-flex items-center gap-1">
          <span class="h-2 w-2 rounded-full" :style="{ background: sphere.color }"></span>{{ sphere.name }}
        </span>
        <span v-if="isRunning" class="font-semibold tabular-nums text-accent">⏱ идёт {{ fmtClock(liveSeconds) }}</span>
        <span v-if="task.estimate_minutes">план {{ fmtMinutes(task.estimate_minutes) }}</span>
        <span v-if="totals.week > 0">неделя {{ fmtSec(totals.week) }}</span>
        <span v-if="totals.month > 0">месяц {{ fmtSec(totals.month) }}</span>
      </div>
    </div>
    <slot />
    <button class="shrink-0 text-xs font-semibold text-mute hover:text-accent" title="Затраченное время" @click="app.openEditor({ task_id: task.id }, task.title)">⏱ время</button>
    <button v-if="!done" class="grid h-9 w-9 shrink-0 place-items-center rounded-full transition"
      :class="isRunning ? 'bg-accent text-white' : 'bg-accent-soft text-accent hover:brightness-95'"
      :aria-label="isRunning ? 'Остановить таймер' : 'Запустить таймер'"
      @click="isRunning ? app.stopTimer() : app.startTimer({ task_id: task.id })">
      <svg v-if="isRunning" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
    </button>
  </div>
</template>
