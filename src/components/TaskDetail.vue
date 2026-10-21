<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { fmtSec } from '../lib/time'
import EstimateInput from './EstimateInput.vue'

const app = useApp()
const task = computed(() => app.data.tasks.find(t => t.id === app.detailId) ?? null)
const title = ref('')
const date = ref('')
const time = ref('')
const estimate = ref<number | null>(null)
const sphereId = ref('')
const busy = ref(false)
const presets = [15, 30, 45, 60, 90, 120]
const isRunning = computed(() => !!task.value && app.running?.task_id === task.value.id)
const totals = computed(() => (task.value ? app.taskTotals[task.value.id] : undefined))

watch(task, t => {
  if (!t) return
  title.value = t.title; date.value = t.due_date ?? ''; time.value = t.start_time?.slice(0, 5) ?? ''
  estimate.value = t.estimate_minutes; sphereId.value = t.sphere_id ?? ''
}, { immediate: true })

async function save() {
  const t = task.value
  if (!t || !title.value.trim()) return
  busy.value = true
  const due = date.value || null
  await app.updateTask(t.id, {
    title: title.value.trim(), due_date: due,
    start_time: due && time.value ? `${time.value}:00` : null, // время без даты не бывает
    estimate_minutes: estimate.value, sphere_id: sphereId.value || null,
    status: t.status === 'done' ? 'done' : due ? 'planned' : 'inbox',
  })
  busy.value = false
  if (!app.error) app.closeTask()
}
async function remove() {
  const t = task.value
  if (t && confirm('Удалить задачу?')) { await app.removeTask(t.id); app.closeTask() }
}
</script>

<template>
  <div v-if="task" class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" @click.self="app.closeTask()">
    <form class="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-bg p-5 md:rounded-3xl" @submit.prevent="save">
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-lg font-bold">Задача</h2>
        <button type="button" class="text-2xl leading-none text-mute" aria-label="Закрыть" @click="app.closeTask()">×</button>
      </div>

      <input v-model="title" class="input" placeholder="Название" required />

      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs text-mute">Дата<input v-model="date" type="date" class="input mt-1" /></label>
        <label class="text-xs text-mute">Время начала<input v-model="time" type="time" class="input mt-1" :disabled="!date" /></label>
      </div>

      <div>
        <div class="mb-1.5 text-xs text-mute">Сколько времени займёт (необязательно)</div>
        <div class="flex flex-wrap items-center gap-1.5">
          <EstimateInput v-model="estimate" />
          <button v-for="p in presets" :key="p" type="button" class="chip py-1.5" :class="estimate === p && 'chip-on'" @click="estimate = estimate === p ? null : p">{{ p }}</button>
          <button v-if="estimate" type="button" class="text-xs text-mute" @click="estimate = null">сбросить</button>
        </div>
      </div>

      <label class="text-xs text-mute">Сфера
        <select v-model="sphereId" class="input mt-1"><option value="">Без сферы</option><option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option></select>
      </label>

      <div v-if="task.status !== 'done'" class="flex items-center gap-2">
        <button type="button" class="btn-ghost flex-1" @click="isRunning ? app.stopTimer() : app.startTimer({ task_id: task.id })">
          {{ isRunning ? '■ Остановить таймер' : '▶ Запустить таймер' }}
        </button>
        <button type="button" class="btn-ghost" @click="app.openEditor({ task_id: task.id }, task.title)">⏱ Время</button>
      </div>
      <p v-if="totals && totals.month > 0" class="text-xs text-mute">Потрачено: неделя {{ fmtSec(totals.week) }} · месяц {{ fmtSec(totals.month) }}</p>

      <div class="flex gap-2">
        <button class="btn-primary flex-1" :disabled="busy">Сохранить</button>
        <button type="button" class="btn-ghost !text-red-700" @click="remove">Удалить</button>
      </div>
    </form>
  </div>
</template>
