<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { fmtSec } from '../lib/time'
import AutoTextarea from './AutoTextarea.vue'
import EstimateInput from './EstimateInput.vue'

const app = useApp()
const task = computed(() => app.data.tasks.find(t => t.id === app.detailId) ?? null)
const title = ref('')
const note = ref('')
const date = ref('')
const time = ref('')
const estimate = ref<number | null>(null)
const sphereId = ref('')
const projectId = ref('')
const newProject = ref('')
/** Новый проект прямо из карточки: создаём в выбранной сфере и сразу выбираем */
async function createProject() {
  const name = newProject.value.trim(); if (!name || !sphereId.value) return
  const p = await app.addProject(sphereId.value, name)
  if (p) { projectId.value = p.id; newProject.value = '' }
}
/** '' — не напоминать, иначе число минут до начала ('0' — в момент начала) */
const remind = ref('')
const remindTouched = ref(false)
const remindOptions = [['', 'Не напоминать'], ['0', 'В момент начала'], ['5', 'За 5 минут'], ['10', 'За 10 минут'], ['15', 'За 15 минут'], ['30', 'За 30 минут'], ['60', 'За 1 час']]
const busy = ref(false)
const presets = [15, 30, 45, 60, 90, 120]
const isRunning = computed(() => !!task.value && app.running?.task_id === task.value.id)
const totals = computed(() => (task.value ? app.taskTotals[task.value.id] : undefined))

watch(task, t => {
  if (!t) return
  title.value = t.title; note.value = t.note ?? ''; date.value = t.due_date ?? ''; time.value = t.start_time?.slice(0, 5) ?? ''
  estimate.value = t.estimate_minutes; sphereId.value = t.sphere_id ?? ''; projectId.value = t.project_id ?? ''
  remind.value = t.remind_before_minutes == null ? '' : String(t.remind_before_minutes); remindTouched.value = false
}, { immediate: true })
// Пользователь впервые поставил время начала задаче без времени — предлагаем напомнить за 10 минут
function onTimeInput() {
  if (time.value && !remind.value && !remindTouched.value && !task.value?.start_time) remind.value = '10'
}

/** Убрать дату целиком (вместе со временем и напоминанием): после сохранения задача вернётся во «Входящие» */
function resetDate() { date.value = ''; time.value = ''; remind.value = ''; remindTouched.value = true }

async function save() {
  const t = task.value
  if (!t || !title.value.trim()) return
  busy.value = true
  const due = date.value || null
  await app.updateTask(t.id, {
    title: title.value.trim(), note: note.value.trim() || null, due_date: due,
    start_time: due && time.value ? `${time.value}:00` : null, // время без даты не бывает
    remind_before_minutes: due && time.value && remind.value !== '' ? Number(remind.value) : null, // напоминание — только если есть время
    estimate_minutes: estimate.value, sphere_id: sphereId.value || null, project_id: sphereId.value && projectId.value ? projectId.value : null,
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

      <AutoTextarea v-model="title" single-line :maxlength="500" required placeholder="Название задачи" @submit="save" />
      <AutoTextarea v-model="note" :min-rows="3" placeholder="Описание задачи" />

      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs text-mute">
          <span class="flex items-center justify-between">Дата<button v-if="date" type="button" class="font-semibold text-accent" aria-label="Сбросить дату" title="Убрать дату: задача вернётся во «Входящие»" @click="resetDate">сбросить</button></span>
          <input v-model="date" type="date" class="input mt-1" />
        </label>
        <label class="text-xs text-mute">Время начала<input v-model="time" type="time" class="input mt-1" :disabled="!date" @input="onTimeInput" @change="onTimeInput" /></label>
      </div>

      <p v-if="!date && task.status !== 'done'" class="-mt-1 text-xs text-mute">Без даты задача лежит во «Входящих».</p>

      <label class="text-xs text-mute">Напоминание
        <select v-model="remind" class="input mt-1" :disabled="!date || !time" @change="remindTouched = true">
          <option v-for="o in remindOptions" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
        </select>
        <span v-if="!date || !time" class="mt-1 block">Чтобы напомнить, задай дату и время начала.</span>
      </label>

      <div>
        <div class="mb-1.5 text-xs text-mute">Сколько времени займёт (необязательно)</div>
        <div class="flex flex-wrap items-center gap-1.5">
          <EstimateInput v-model="estimate" />
          <button v-for="p in presets" :key="p" type="button" class="chip py-1.5" :class="estimate === p && 'chip-on'" @click="estimate = estimate === p ? null : p">{{ p }}</button>
          <button v-if="estimate" type="button" class="text-xs text-mute" @click="estimate = null">сбросить</button>
        </div>
      </div>

      <label class="text-xs text-mute">Сфера
        <select v-model="sphereId" class="input mt-1" @change="projectId = ''"><option value="">Без сферы</option><option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option></select>
      </label>
      <div v-if="sphereId" class="text-xs text-mute">
        <label>Проект
          <select v-model="projectId" class="input mt-1"><option value="">Без проекта</option><option v-for="p in app.projectsOf(sphereId)" :key="p.id" :value="p.id">{{ p.name }}</option><option v-if="projectId && app.projectById(projectId)?.status === 'archived'" :value="projectId">{{ app.projectById(projectId)?.name }} (в архиве)</option></select>
        </label>
        <form class="mt-1.5 flex gap-1.5" @submit.prevent="createProject">
          <input v-model="newProject" class="input min-w-0 flex-1 !py-1.5 text-sm" maxlength="80" placeholder="＋ Новый проект в этой сфере" aria-label="Новый проект" />
          <button class="btn-ghost shrink-0 !py-1.5" :disabled="!newProject.trim()" aria-label="Добавить проект">Добавить</button>
        </form>
      </div>

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
