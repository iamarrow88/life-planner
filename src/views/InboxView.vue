<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { addDays, shortDate, weekStart } from '../lib/time'
import TaskRow from '../components/TaskRow.vue'
import AutoTextarea from '../components/AutoTextarea.vue'
import EstimateInput from '../components/EstimateInput.vue'
import DoneBlock from '../components/DoneBlock.vue'

const app = useApp()
const text = ref('')
const estimate = ref<number | null>(null)

async function add() {
  const title = text.value.trim()
  if (!title) return
  const est = estimate.value
  text.value = ''; estimate.value = null
  await app.addTask({ title, status: 'inbox', estimate_minutes: est })
}
/** Выполненные задачи «из входящих»: те, которые так и не получили дату */
const doneUndated = computed(() => app.data.tasks.filter(t => t.status === 'done' && !t.due_date))
/** Предустановленное время для быстрого планирования */
const TIMES = ['09:00', '14:00', '18:00']
/** Для какой задачи и на какую дату сейчас выбирается время (всплывающее окно) */
const choosing = ref<{ id: string; date: string } | null>(null)
const choose = (id: string, date: string) => { menu.value = null; choosing.value = choosing.value?.id === id && choosing.value.date === date ? null : { id, date } }
/** Окно выбора сферы → проекта этой сферы (шаг 'sphere' или 'project'); noDate — выбор открыт кнопкой «Без даты» */
const menu = ref<{ id: string; step: 'sphere' | 'project'; sphereId?: string; noDate?: boolean } | null>(null)
const toggleMenu = (id: string) => { choosing.value = null; menu.value = menu.value?.id === id ? null : { id, step: 'sphere' } }
/** Подпись на кнопке: «Сфера» или «Хобби › Вышивка» */
function sphereLabel(t: { sphere_id: string | null; project_id?: string | null }): string {
  const s = app.sphereById(t.sphere_id)
  if (!s) return 'Сфера'
  const p = app.projectById(t.project_id)
  return p ? `${s.name} › ${p.name}` : s.name
}
/** Выбрали сферу: если в ней есть проекты — спрашиваем проект, иначе сразу фиксируем */
async function pickSphere(id: string, sphereId: string | null) {
  const noDate = !!menu.value?.noDate
  if (sphereId && app.projectsOf(sphereId).length) { menu.value = { id, step: 'project', sphereId, noDate }; return }
  menu.value = null
  if (noDate && sphereId) { await app.setTaskNoDate(id, { sphere_id: sphereId, project_id: null }); return }
  const t = app.data.tasks.find(x => x.id === id)
  if (t && t.sphere_id === sphereId && !t.project_id) return
  await app.setTaskSphere(id, sphereId)
}
const newProjectName = ref('')
async function createProject(id: string, sphereId: string) {
  const name = newProjectName.value.trim(); if (!name) return
  const p = await app.addProject(sphereId, name); newProjectName.value = ''
  if (p) await pickProject(id, sphereId, p.id)
}
async function pickProject(id: string, sphereId: string, projectId: string | null) {
  const noDate = !!menu.value?.noDate
  menu.value = null
  if (noDate) { await app.setTaskNoDate(id, { sphere_id: sphereId, project_id: projectId }); return }
  await app.setTaskProject(id, projectId, sphereId)
}
/** «Без даты»: задача со сферой сразу уходит из «Входящих»; без сферы — сначала спрашиваем сферу (и проект) */
async function noDate(t: { id: string; sphere_id: string | null }) {
  choosing.value = null
  if (t.sphere_id) { menu.value = null; await app.setTaskNoDate(t.id); return }
  menu.value = menu.value?.id === t.id && menu.value.noDate ? null : { id: t.id, step: 'sphere', noDate: true }
}
const dateLabel = (d: string) => d === app.today ? 'Сегодня' : d === addDays(app.today, 1) ? 'Завтра' : shortDate(d)
/** Зафиксировать дату и время (null — «без времени»); задача уходит из «Входящих» в план. Для задачи со временем напоминание — за 10 минут */
async function plan(id: string, date: string, time: string | null) {
  choosing.value = null
  await app.updateTask(id, {
    status: 'planned', due_date: date,
    start_time: time ? `${time}:00` : null, remind_before_minutes: time ? 10 : null,
  })
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { choosing.value = null; menu.value = null } }
/** Клик куда угодно, кроме самого окна и кнопок планирования, закрывает окно */
const onDocClick = (e: MouseEvent) => {
  // composedPath() запоминает цепочку элементов в момент клика: после перерисовки окна (шаг «сфера» → «проект») сама кнопка уже убрана из страницы
  const inside = e.composedPath().some(n => n instanceof HTMLElement && n.matches('[role=dialog], [data-quick]'))
  if ((choosing.value || menu.value) && !inside) { choosing.value = null; menu.value = null }
}
onMounted(() => { window.addEventListener('keydown', onKey); document.addEventListener('click', onDocClick) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); document.removeEventListener('click', onDocClick) })
/** Календарь выбора даты. Скрытое поле даты само по клику не открывается, поэтому вызываем showPicker() */
function openPicker(e: MouseEvent) {
  const input = (e.currentTarget as HTMLElement).parentElement?.querySelector('input')
  if (!input) return
  try { input.showPicker() } catch { input.focus(); input.click() }
}
/** Дату выбрали в календаре — теперь спрашиваем время */
function pickedDate(id: string, e: Event) {
  const el = e.target as HTMLInputElement
  if (el.value) { choosing.value = { id, date: el.value }; el.value = '' }
}
</script>

<template>
  <h1 class="mb-1 text-2xl font-bold">Входящие</h1>
  <p class="mb-4 text-sm text-mute">Всё, что не хочется держать в голове. Разберёшь потом.</p>

  <form class="mb-5 flex flex-wrap items-start gap-2" @submit.prevent="add">
    <AutoTextarea v-model="text" single-line :maxlength="500" class="!w-auto min-w-[12rem] flex-1" placeholder="Что нужно запомнить?" autofocus @submit="add" />
    <EstimateInput v-model="estimate" />
    <button class="btn-primary shrink-0" :disabled="!text.trim()">Добавить</button>
  </form>

  <div v-if="!app.inbox.length && !app.loading" class="card p-8 text-center text-mute">
    Пусто — отличное состояние ✨
  </div>
  <ul v-else class="space-y-3">
    <li v-for="t in app.inbox" :key="t.id" class="card">
      <TaskRow :task="t" />
      <div class="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <button data-quick class="chip hover:chip-on" :class="choosing?.id === t.id && choosing.date === app.today && 'chip-on'" @click="choose(t.id, app.today)">Сегодня</button>
        <button data-quick class="chip hover:chip-on" :class="choosing?.id === t.id && choosing.date === addDays(app.today, 1) && 'chip-on'" @click="choose(t.id, addDays(app.today, 1))">Завтра</button>
        <span class="relative inline-flex">
          <button data-quick type="button" class="chip hover:chip-on" @click="openPicker">Дата…</button>
          <input type="date" tabindex="-1" aria-hidden="true" class="pointer-events-none absolute inset-0 opacity-0" :min="app.today"
            @change="e => pickedDate(t.id, e)" />
        </span>
        <button data-quick type="button" class="chip hover:chip-on" :class="menu?.id === t.id && menu.noDate && 'chip-on'" data-test="quick-no-date" :title="t.sphere_id ? 'Убрать из «Входящих» в список «Без даты»' : 'Выбери сферу — и задача уйдёт из «Входящих» в список «Без даты»'" @click="noDate(t)">Без даты</button>
        <button data-quick type="button" class="chip hover:chip-on" :class="((menu?.id === t.id && !menu.noDate) || t.sphere_id) && 'chip-on'" @click="toggleMenu(t.id)">{{ sphereLabel(t) }} ▾</button>
        <button class="ml-auto text-xs text-mute hover:text-red-600" @click="app.removeTask(t.id)">Удалить</button>
      </div>
      <!-- Всплывающее окно: во сколько? -->
      <template v-if="choosing?.id === t.id">
        <div class="relative">
          <div role="dialog" aria-label="Выбери время" class="absolute left-3 top-1 z-20 w-64 rounded-2xl border border-line bg-white p-3 shadow-lg">
            <div class="mb-2 flex items-center justify-between text-sm">
              <span class="font-semibold">{{ dateLabel(choosing.date) }} — во сколько?</span>
              <button type="button" class="text-lg leading-none text-mute" aria-label="Закрыть" @click="choosing = null">×</button>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <button v-for="tm in TIMES" :key="tm" type="button" class="chip justify-center py-1.5 text-sm hover:chip-on" @click="plan(t.id, choosing?.date, tm)">{{ tm }}</button>
            </div>
            <button type="button" class="chip mt-2 w-full justify-center py-1.5 text-sm hover:chip-on" @click="plan(t.id, choosing?.date, null)">Без времени</button>
          </div>
        </div>
      </template>
      <!-- Всплывающее окно: сфера, затем проект -->
      <div v-if="menu?.id === t.id" class="relative">
        <div role="dialog" :aria-label="menu.step === 'sphere' ? 'Выбери сферу' : 'Выбери проект'" class="absolute left-3 top-1 z-20 w-64 rounded-2xl border border-line bg-white p-3 shadow-lg">
          <template v-if="menu.step === 'sphere'">
            <div class="mb-2 flex items-center justify-between text-sm">
              <span class="font-semibold">{{ menu.noDate ? 'Без даты — в какую сферу?' : 'Сфера' }}</span>
              <button type="button" class="text-lg leading-none text-mute" aria-label="Закрыть" @click="menu = null">×</button>
            </div>
            <div class="flex flex-col gap-1.5">
              <button v-for="s in app.spheres" :key="s.id" type="button" class="chip w-full justify-start gap-2 py-1.5 text-sm hover:chip-on" :class="t.sphere_id === s.id && 'chip-on'" @click="pickSphere(t.id, s.id)">
                <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: s.color }"></span>{{ s.name }}
                <span v-if="app.projectsOf(s.id).length" class="ml-auto text-xs text-mute">проектов: {{ app.projectsOf(s.id).length }} ›</span>
              </button>
              <button v-if="!menu?.noDate" type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" :class="!t.sphere_id && 'chip-on'" @click="pickSphere(t.id, null)">Без сферы</button>
            </div>
            <p v-if="!app.spheres.length" class="text-xs text-mute">Сначала создай сферу на вкладке «Сферы».</p>
          </template>
          <template v-else-if="menu?.sphereId">
            <div class="mb-2 flex items-center justify-between text-sm">
              <button type="button" class="text-mute" aria-label="Назад к сферам" @click="menu = { id: t.id, step: 'sphere', noDate: menu?.noDate }">‹</button>
              <span class="flex-1 truncate px-2 font-semibold">{{ app.sphereById(menu.sphereId)?.name }}</span>
              <button type="button" class="text-lg leading-none text-mute" aria-label="Закрыть" @click="menu = null">×</button>
            </div>
            <div class="flex flex-col gap-1.5">
              <button v-for="p in app.projectsOf(menu?.sphereId)" :key="p.id" type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" :class="t.project_id === p.id && 'chip-on'" @click="pickProject(t.id, menu?.sphereId!, p.id)">{{ p.name }}</button>
              <button type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" @click="pickProject(t.id, menu?.sphereId!, null)">Без проекта</button>
              <form class="mt-1 flex gap-1.5" @submit.prevent="createProject(t.id, menu?.sphereId!)">
                <input v-model="newProjectName" class="input min-w-0 flex-1 !py-1 text-sm" maxlength="80" placeholder="Новый проект" aria-label="Новый проект" />
                <button class="btn-primary !px-3 !py-1" :disabled="!newProjectName.trim()" aria-label="Добавить проект">+</button>
              </form>
            </div>
          </template>
        </div>
      </div>
    </li>
  </ul>

  <DoneBlock :tasks="doneUndated" :since="weekStart(app.today)" />
</template>
