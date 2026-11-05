<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { addDays, dayOf, shortDate, weekStart } from '../lib/time'
import TaskRow from '../components/TaskRow.vue'
import AutoTextarea from '../components/AutoTextarea.vue'
import EstimateInput from '../components/EstimateInput.vue'
import ComplexityPicker from '../components/ComplexityPicker.vue'
import DoneBlock from '../components/DoneBlock.vue'
import QuickTags from '../components/QuickTags.vue'
import TagBar from '../components/TagBar.vue'
import TaskFilter from '../components/TaskFilter.vue'
import { useTaskFilter } from '../lib/taskFilter'
import { vDragSort } from '../lib/dragSort'
import TaskMoreMenu from '../components/TaskMoreMenu.vue'

const app = useApp()
const text = ref('')
const estimate = ref<number | null>(null)
const complexity = ref<number | null>(null)

async function add() {
  const title = text.value.trim()
  if (!title) return
  const est = estimate.value, level = complexity.value
  text.value = ''; estimate.value = null; complexity.value = null
  await app.addTask({ title, status: 'inbox', estimate_minutes: est, complexity: level, ...newTaskFields() })
}
// ---- Отложено без даты: залежавшиеся — наверху основного списка с вопросом «решить?», остальные — в свёрнутом блоке внизу
// отбор по сфере / проекту — свой у «Входящих»
const { filter, active: filterOn, match, newTaskFields } = useTaskFilter('inbox')
const rows = computed(() => [...app.staleDeferred, ...app.inbox].filter(match))
const deferredRows = computed(() => app.freshDeferred.filter(match))
const staleIds = computed(() => new Set(app.staleDeferred.map(t => t.id)))
const idleDays = (t: { updated_at?: string }) => {
  if (!t.updated_at) return 0
  const [a, b] = [dayOf(t.updated_at), app.today].map(s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)))
  return Math.round((b - a) / 86400000)
}
const showDeferred = ref(false)
/** Дата из блока «Отложено»: сразу в план, без вопроса о времени */
function pickDeferred(id: string, e: Event) {
  const el = e.target as HTMLInputElement
  if (el.value) { void plan(id, el.value, null); el.value = '' }
}
/** Выполненные задачи «из входящих»: те, которые так и не получили дату */
const doneUndated = computed(() => app.data.tasks.filter(t => t.status === 'done' && !t.due_date && match(t)))
/** Предустановленное время для быстрого планирования */
const TIMES = ['09:00', '14:00', '18:00']
/** Для какой задачи и на какую дату сейчас выбирается время (всплывающее окно) */
const choosing = ref<{ id: string; date: string } | null>(null)
const choose = (id: string, date: string) => { menu.value = null; more.value = null; choosing.value = choosing.value?.id === id && choosing.value.date === date ? null : { id, date } }
/** Окно выбора сферы → проекта этой сферы (шаг 'sphere' или 'project') */
const menu = ref<{ id: string; step: 'sphere' | 'project'; sphereId?: string } | null>(null)
const toggleMenu = (id: string) => { choosing.value = null; more.value = null; menu.value = menu.value?.id === id ? null : { id, step: 'sphere' } }
/** Окно «Ещё»: у какой задачи открыто. Задача превращается в желание, книгу или фильм и уходит из «Входящих» */
const more = ref<string | null>(null)
const toggleMore = (id: string) => { choosing.value = null; menu.value = null; more.value = more.value === id ? null : id }
/** Подпись на кнопке: «Сфера» или «Хобби › Вышивка» */
function sphereLabel(t: { sphere_id: string | null; project_id?: string | null }): string {
  const s = app.sphereById(t.sphere_id)
  if (!s) return 'Сфера'
  const p = app.projectById(t.project_id)
  return p ? `${s.name} › ${p.name}` : s.name
}
/** Выбрали сферу: если в ней есть проекты — спрашиваем проект, иначе сразу фиксируем */
async function pickSphere(id: string, sphereId: string | null) {
  if (sphereId && app.projectsOf(sphereId).length) { menu.value = { id, step: 'project', sphereId }; return }
  menu.value = null
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
  menu.value = null
  await app.setTaskProject(id, projectId, sphereId)
}
/** «Без даты»: задачу разобрала, но когда ею заняться — пока не знаю. Уходит в «Отложено без даты» (сфера не обязательна) */
async function noDate(t: { id: string }) {
  choosing.value = null; menu.value = null
  await app.setTaskNoDate(t.id)
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
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { choosing.value = null; menu.value = null; more.value = null } }
/** Клик куда угодно, кроме самого окна и кнопок планирования, закрывает окно */
const onDocClick = (e: MouseEvent) => {
  // composedPath() запоминает цепочку элементов в момент клика: после перерисовки окна (шаг «сфера» → «проект») сама кнопка уже убрана из страницы
  const inside = e.composedPath().some(n => n instanceof HTMLElement && n.matches('[role=dialog], [data-quick]'))
  if ((choosing.value || menu.value || more.value) && !inside) { choosing.value = null; menu.value = null; more.value = null }
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
  <h1 class="mb-1 flex items-center gap-2 text-2xl font-bold">Входящие
    <button type="button" class="grid h-8 w-8 place-items-center rounded-full text-base font-normal text-mute hover:bg-accent-soft hover:text-accent" aria-label="Поиск задач" title="Поиск по задачам и тегам" data-test="open-search" @click="app.openSearch()">🔍</button>
  </h1>
  <p class="mb-4 text-sm text-mute">Всё, что не хочется держать в голове. Разберёшь потом.</p>

  <form class="mb-5 flex flex-wrap items-start gap-2" @submit.prevent="add">
    <AutoTextarea v-model="text" single-line :maxlength="500" class="!w-auto min-w-[12rem] flex-1" placeholder="Что нужно запомнить?" autofocus @submit="add" />
    <EstimateInput v-model="estimate" />
    <ComplexityPicker v-model="complexity" />
    <button class="btn-primary shrink-0" :disabled="!text.trim()">Добавить</button>
    <!-- Отбор по сфере / проекту, за ним 🏷 — одной строкой; если места нет, теги переносятся ниже -->
    <div class="flex w-full flex-wrap items-start gap-2">
      <TaskFilter v-model="filter" class="!mb-0 min-w-0" />
      <QuickTags v-model="text" large class="!w-auto min-w-0 max-w-full" />
    </div>
  </form>
  <TagBar v-model="filter.tags" />

  <div v-if="!rows.length && !app.loading" class="card p-8 text-center text-mute">
    {{ filterOn ? 'С таким отбором во «Входящих» пусто' : 'Пусто — отличное состояние ✨' }}
  </div>
  <ul v-else v-drag-sort="(ids: string[]) => app.reorderTasks(ids)" class="space-y-3" data-test="inbox-list">
    <li v-for="t in rows" :key="t.id" :data-id="t.id" class="card" :class="staleIds.has(t.id) && 'border-amber-300'" :data-stale="staleIds.has(t.id) || undefined">
      <p v-if="staleIds.has(t.id)" class="rounded-t-2xl bg-amber-50 px-3 py-1.5 text-xs text-amber-900" data-test="stale-note">Отложена {{ idleDays(t) }} дн. назад и без даты — решить?</p>
      <TaskRow :task="t" sortable />
      <div class="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <button data-quick class="chip hover:chip-on" :class="choosing?.id === t.id && choosing.date === app.today && 'chip-on'" @click="choose(t.id, app.today)">Сегодня</button>
        <button data-quick class="chip hover:chip-on" :class="choosing?.id === t.id && choosing.date === addDays(app.today, 1) && 'chip-on'" @click="choose(t.id, addDays(app.today, 1))">Завтра</button>
        <span class="relative inline-flex">
          <button data-quick type="button" class="chip hover:chip-on" @click="openPicker">Дата…</button>
          <input type="date" tabindex="-1" aria-hidden="true" class="pointer-events-none absolute inset-0 opacity-0" :min="app.today"
            @change="e => pickedDate(t.id, e)" />
        </span>
        <button v-if="staleIds.has(t.id)" data-quick type="button" class="chip hover:chip-on" data-test="stale-snooze" :title="'Оставить без даты — снова спрошу через ' + app.staleDays + ' дн.'" @click="app.snoozeTask(t.id)">Ещё отложить</button>
        <button v-else data-quick type="button" class="chip hover:chip-on" data-test="quick-no-date" title="Разобрала, но когда заняться — пока не знаю: в «Отложено без даты»" @click="noDate(t)">Без даты</button>
        <button data-quick type="button" class="chip hover:chip-on" :class="(menu?.id === t.id || t.sphere_id) && 'chip-on'" @click="toggleMenu(t.id)">{{ sphereLabel(t) }} ▾</button>
        <button data-quick type="button" class="chip hover:chip-on" :class="more === t.id && 'chip-on'" :aria-expanded="more === t.id" data-test="inbox-more" @click="toggleMore(t.id)">Ещё ▾</button>
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
      <!-- Всплывающее окно: сделать задачу желанием, книгой или фильмом -->
      <TaskMoreMenu v-if="more === t.id" :task="t" @close="more = null" />
      <!-- Всплывающее окно: сфера, затем проект -->
      <div v-if="menu?.id === t.id" class="relative">
        <div role="dialog" :aria-label="menu.step === 'sphere' ? 'Выбери сферу' : 'Выбери проект'" class="absolute left-3 top-1 z-20 w-64 rounded-2xl border border-line bg-white p-3 shadow-lg">
          <template v-if="menu.step === 'sphere'">
            <div class="mb-2 flex items-center justify-between text-sm">
              <span class="font-semibold">Сфера</span>
              <button type="button" class="text-lg leading-none text-mute" aria-label="Закрыть" @click="menu = null">×</button>
            </div>
            <div class="flex flex-col gap-1.5">
              <button v-for="s in app.spheres" :key="s.id" type="button" class="chip w-full justify-start gap-2 py-1.5 text-sm hover:chip-on" :class="t.sphere_id === s.id && 'chip-on'" @click="pickSphere(t.id, s.id)">
                <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: s.color }"></span>{{ s.name }}
                <span v-if="app.projectsOf(s.id).length" class="ml-auto text-xs text-mute">проектов: {{ app.projectsOf(s.id).length }} ›</span>
              </button>
              <button type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" :class="!t.sphere_id && 'chip-on'" @click="pickSphere(t.id, null)">Без сферы</button>
            </div>
            <p v-if="!app.spheres.length" class="text-xs text-mute">Сначала создай сферу на вкладке «Сферы».</p>
          </template>
          <template v-else-if="menu?.sphereId">
            <div class="mb-2 flex items-center justify-between text-sm">
              <button type="button" class="text-mute" aria-label="Назад к сферам" @click="menu = { id: t.id, step: 'sphere' }">‹</button>
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

  <!-- Отложено без даты: явно нажато «Без даты» — свёрнуто, число видно всегда -->
  <section v-if="deferredRows.length" class="mt-6" data-test="deferred">
    <button type="button" class="mb-2 flex w-full items-center justify-between text-left" :aria-expanded="showDeferred" data-test="deferred-toggle" @click="showDeferred = !showDeferred">
      <span class="text-sm font-semibold uppercase tracking-wide text-mute">Отложено без даты · {{ deferredRows.length }}</span>
      <span class="text-lg text-mute">{{ showDeferred ? '▴' : '▾' }}</span>
    </button>
    <template v-if="showDeferred">
      <p class="mb-2 text-xs text-mute">Если задачу не трогать {{ app.staleDays }} дн., она вернётся наверх «Входящих» с вопросом «решить?».</p>
      <ul v-drag-sort="(ids: string[]) => app.reorderTasks(ids)" class="card divide-y divide-line" data-test="deferred-list">
        <li v-for="t in deferredRows" :key="t.id" :data-id="t.id">
          <TaskRow :task="t" sortable />
          <div class="flex flex-wrap items-center gap-2 px-3 pb-2">
            <button type="button" class="chip hover:chip-on" @click="plan(t.id, app.today, null)">Сегодня</button>
            <button type="button" class="chip hover:chip-on" @click="plan(t.id, addDays(app.today, 1), null)">Завтра</button>
            <span class="relative inline-flex">
              <button type="button" class="chip hover:chip-on" @click="openPicker">Дата…</button>
              <input type="date" tabindex="-1" aria-hidden="true" class="pointer-events-none absolute inset-0 opacity-0" :min="app.today" @change="e => pickDeferred(t.id, e)" />
            </span>
            <button data-quick type="button" class="chip hover:chip-on" :class="more === t.id && 'chip-on'" :aria-expanded="more === t.id" data-test="deferred-more" @click="toggleMore(t.id)">Ещё ▾</button>
          </div>
          <TaskMoreMenu v-if="more === t.id" :task="t" @close="more = null" />
        </li>
      </ul>
    </template>
  </section>

  <DoneBlock :tasks="doneUndated" :since="weekStart(app.today)" />
</template>
