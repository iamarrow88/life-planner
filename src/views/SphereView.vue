<script setup lang="ts">
// Карточка сферы: подробности, задачи по проектам, привычки и повторы этой сферы — всё можно править прямо здесь
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApp } from '../stores/app'
import type { Task } from '../types'
import TaskRow from '../components/TaskRow.vue'
import HabitRow from '../components/HabitRow.vue'
import HabitForm from '../components/HabitForm.vue'
import RecurrenceForm from '../components/RecurrenceForm.vue'
import AutoTextarea from '../components/AutoTextarea.vue'
import EstimateInput from '../components/EstimateInput.vue'
import DoneBlock from '../components/DoneBlock.vue'
import ProjectArchive from '../components/ProjectArchive.vue'
import { describe } from '../lib/recurrence'
import { dayOf, fmtMinutes, shortDate, weekStart } from '../lib/time'

const app = useApp()
const route = useRoute()
const COLORS = ['#3E8E5F', '#7B5CC4', '#D9783A', '#2F6DB3', '#C0475F', '#B58B1F']
const id = computed(() => String(route.params.id))
const sphere = computed(() => app.sphereById(id.value))

// ---- Цифры
const goal = computed(() => app.goalFor(id.value))
const weekMin = computed(() => Math.round(app.weekMinutes[id.value] ?? 0))
const monthMin = computed(() => Math.round(app.monthMinutes[id.value] ?? 0))
const pct = computed(() => (goal.value ? Math.min(100, Math.round((weekMin.value / goal.value) * 100)) : 0))
const sphereTasks = computed(() => app.data.tasks.filter(t => t.sphere_id === id.value))
const openTasks = computed(() => sphereTasks.value.filter(t => t.status !== 'done'))
const doneTasks = computed(() => sphereTasks.value.filter(t => t.status === 'done'))
const doneThisWeek = computed(() => doneTasks.value.filter(t => t.done_at && dayOf(t.done_at) >= weekStart(app.today)).length)
const timerOn = computed(() => app.running?.sphere_id === id.value && !app.running?.task_id && !app.running?.habit_id)

// ---- Задачи по проектам: сначала без проекта, потом проекты; внутри — по дате (без даты в конце)
const byDate = (a: Task, b: Task) =>
  (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.start_time ?? '99').localeCompare(b.start_time ?? '99')
const projects = computed(() => app.projectsOf(id.value))
const tasksOf = (projectId: string | null) => openTasks.value.filter(t => (t.project_id ?? null) === projectId).sort(byDate)
/** Задачи из архивных проектов (их могли оставить там при архивации) показываем вместе с задачами без проекта */
const looseTasks = computed(() => openTasks.value.filter(t => !t.project_id || !projects.value.some(p => p.id === t.project_id)).sort(byDate))
const collapsed = ref<Record<string, boolean>>({})
const dateClass = (d: string) => (d < app.today ? 'text-amber-700' : 'text-mute')
const dateLabel = (d: string) => (d === app.today ? 'сегодня' : shortDate(d))

// ---- Новая задача (в выбранный проект или просто в сферу)
const text = ref('')
const estimate = ref<number | null>(null)
const newTaskProject = ref('')
async function addTask(projectId = newTaskProject.value) {
  const title = text.value.trim(); if (!title) return
  const est = estimate.value
  text.value = ''; estimate.value = null
  await app.addTask({ title, status: 'inbox', sphere_id: id.value, project_id: projectId || null, estimate_minutes: est })
}
/** Быстрое добавление прямо в группе проекта */
const quick = ref<Record<string, string>>({})
async function addTo(projectId: string | null) {
  const key = projectId ?? ''
  const title = (quick.value[key] ?? '').trim(); if (!title) return
  quick.value[key] = ''
  await app.addTask({ title, status: 'inbox', sphere_id: id.value, project_id: projectId })
}

// ---- Проекты
const newProject = ref('')
async function addProject() {
  const name = newProject.value.trim(); if (!name) return
  newProject.value = ''
  await app.addProject(id.value, name)
}
const editingProject = ref<string | null>(null)
const editProjectName = ref('')
function startRename(pid: string, name: string) { editingProject.value = pid; editProjectName.value = name }
async function saveRename(pid: string) {
  const name = editProjectName.value.trim()
  editingProject.value = null
  if (name) await app.renameProject(pid, name)
}
const moving = ref<string | null>(null)
async function moveProject(pid: string, name: string, toSphere: string) {
  const n = app.data.tasks.filter(t => t.project_id === pid).length
  const to = app.sphereById(toSphere)?.name ?? ''
  if (!window.confirm(`Перенести проект «${name}» в сферу «${to}»?${n ? ` Его задачи (${n}) и учтённое время тоже перейдут в эту сферу.` : ''}`)) return
  moving.value = null
  await app.moveProject(pid, toSphere)
}
const archiving = ref<string | null>(null)
const showArchive = ref(false)
async function removeProject(pid: string, name: string) {
  const n = app.data.tasks.filter(t => t.project_id === pid && t.status !== 'done').length
  const tail = n ? ` Задачи (${n}) останутся в сфере, просто без проекта.` : ''
  if (window.confirm(`Удалить проект «${name}»?${tail}`)) await app.removeProject(pid)
}

// ---- Привычки и повторы сферы
const habits = computed(() => app.data.habits.filter(h => h.sphere_id === id.value))
const showHabitForm = ref(false)
const recurrences = computed(() => app.data.recurrences.filter(r => r.sphere_id === id.value))
const showRecForm = ref(false)
async function removeRecurrence(rid: string, title: string) {
  if (window.confirm(`Удалить повтор «${title}»? Уже созданные задачи останутся.`)) await app.removeRecurrence(rid)
}

// ---- Редактирование сферы (название, цвет, описание, цель по умолчанию)
const editing = ref(false)
const eName = ref(''); const eColor = ref(''); const eDesc = ref(''); const eGoal = ref(0)
function startEdit() {
  const s = sphere.value; if (!s) return
  editing.value = true; eName.value = s.name; eColor.value = s.color; eDesc.value = s.description ?? ''
  eGoal.value = Math.round((s.weekly_goal_minutes / 60) * 100) / 100
}
async function saveEdit() {
  const name = eName.value.trim(); if (!name) return
  const ok = await app.updateSphere(id.value, {
    name, color: eColor.value, description: eDesc.value.trim() || null,
    weekly_goal_minutes: Math.max(0, Math.round((eGoal.value || 0) * 60)),
  })
  if (ok) editing.value = false
}
const hasWeekOwnGoal = computed(() => app.data.weekGoals.some(g => g.sphere_id === id.value && g.week_start === weekStart(app.today)))
</script>

<template>
  <RouterLink to="/spheres" class="mb-3 inline-block text-sm font-semibold text-accent">‹ Все сферы</RouterLink>

  <div v-if="!sphere" class="card p-8 text-center text-mute">Такой сферы нет — возможно, она в архиве или удалена.</div>
  <template v-else>
    <!-- Шапка: название, описание, цифры -->
    <section class="card mb-5 p-4" :style="{ borderTop: `4px solid ${sphere.color}` }">
      <div class="flex items-center gap-3">
        <span class="h-3.5 w-3.5 shrink-0 rounded-full" :style="{ background: sphere.color }"></span>
        <h1 class="min-w-0 flex-1 truncate text-2xl font-bold">{{ sphere.name }}</h1>
        <button type="button" class="text-sm text-mute hover:text-accent" aria-label="Редактировать сферу" title="Редактировать сферу" @click="editing ? (editing = false) : startEdit()">✎</button>
        <button class="rounded-full px-3 py-1 text-xs font-semibold transition" :class="timerOn ? 'bg-accent text-white' : 'bg-accent-soft text-accent'"
          @click="timerOn ? app.stopTimer() : app.startTimer({ sphere_id: sphere.id })">{{ timerOn ? 'Стоп' : '▶ Таймер' }}</button>
      </div>
      <p v-if="sphere.description && !editing" class="mt-2 whitespace-pre-line break-words text-sm text-mute">{{ sphere.description }}</p>

      <form v-if="editing" class="mt-3 space-y-3 rounded-xl bg-bg p-3" @submit.prevent="saveEdit">
        <input v-model="eName" class="input" maxlength="80" required aria-label="Название сферы" placeholder="Название сферы" />
        <AutoTextarea v-model="eDesc" :min-rows="3" :maxlength="2000" aria-label="Описание сферы" placeholder="Описание сферы" />
        <div class="flex flex-wrap items-center gap-2">
          <button v-for="c in COLORS" :key="c" type="button" class="h-8 w-8 rounded-full ring-offset-2" :class="eColor.toLowerCase() === c.toLowerCase() && 'ring-2 ring-ink'" :style="{ background: c }" :aria-label="'Цвет ' + c" @click="eColor = c"></button>
          <input v-model="eColor" type="color" class="h-8 w-8 cursor-pointer rounded-full border border-line bg-white p-0.5" aria-label="Свой цвет" title="Свой цвет" />
        </div>
        <label class="flex items-center gap-3 text-sm text-mute">Цель на неделю по умолчанию, часов
          <input v-model.number="eGoal" type="number" min="0" step="0.5" class="input !w-24" aria-label="Цель по умолчанию, часов" />
        </label>
        <p v-if="hasWeekOwnGoal" class="text-xs text-mute">Для этой недели задана своя цель — она не изменится (её можно поправить на экране «Сферы»).</p>
        <div class="flex gap-2">
          <button class="btn-primary flex-1" :disabled="!eName.trim()">Сохранить</button>
          <button type="button" class="btn-ghost" @click="editing = false">Отмена</button>
        </div>
      </form>

      <div class="mt-4 h-2 overflow-hidden rounded-full bg-line">
        <div class="h-full rounded-full transition-all" :style="{ width: pct + '%', background: sphere.color }"></div>
      </div>
      <div class="mt-1.5 flex justify-between text-xs text-mute">
        <span>неделя {{ fmtMinutes(weekMin) }}<template v-if="goal"> из {{ fmtMinutes(goal) }} · {{ pct }}%</template></span>
        <button class="font-medium text-accent" @click="app.openEditor({ sphere_id: sphere.id }, sphere.name)">Править время</button>
      </div>
      <dl class="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <div class="rounded-xl bg-bg p-2"><dt class="text-xs text-mute">За месяц</dt><dd class="font-semibold">{{ fmtMinutes(monthMin) }}</dd></div>
        <div class="rounded-xl bg-bg p-2"><dt class="text-xs text-mute">Открытых задач</dt><dd class="font-semibold">{{ openTasks.length }}</dd></div>
        <div class="rounded-xl bg-bg p-2"><dt class="text-xs text-mute">Сделано за неделю</dt><dd class="font-semibold">{{ doneThisWeek }}</dd></div>
        <div class="rounded-xl bg-bg p-2"><dt class="text-xs text-mute">Проектов</dt><dd class="font-semibold">{{ projects.length }}</dd></div>
      </dl>
    </section>

    <!-- Задачи -->
    <section class="mb-6">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Задачи</h2>
      <form class="mb-3 flex flex-wrap items-start gap-2" @submit.prevent="addTask()">
        <AutoTextarea v-model="text" single-line :maxlength="500" class="!w-auto min-w-[10rem] flex-1" placeholder="Новая задача в этой сфере…" @submit="addTask()" />
        <select v-if="projects.length" v-model="newTaskProject" class="input !w-auto !py-2 text-sm" aria-label="Проект новой задачи">
          <option value="">Без проекта</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <EstimateInput v-model="estimate" />
        <button class="btn-primary shrink-0" :disabled="!text.trim()">+</button>
      </form>
      <p class="-mt-1 mb-3 text-xs text-mute">Новые задачи без даты лежат во «Входящих» — дату можно поставить в карточке задачи.</p>

      <!-- Без проекта -->
      <div class="mb-3">
        <button type="button" class="mb-1.5 flex w-full items-center gap-2 text-left text-sm font-semibold" @click="collapsed[''] = !collapsed['']">
          <span class="flex-1">Без проекта <span class="font-normal text-mute">· {{ looseTasks.length }}</span></span>
          <span class="text-mute">{{ collapsed[''] ? '▾' : '▴' }}</span>
        </button>
        <div v-if="!collapsed['']" class="card divide-y divide-line">
          <TaskRow v-for="t in looseTasks" :key="t.id" :task="t">
            <span v-if="t.due_date" class="shrink-0 text-xs" :class="dateClass(t.due_date)">{{ dateLabel(t.due_date) }}</span>
          </TaskRow>
          <p v-if="!looseTasks.length" class="px-3 py-2.5 text-sm text-mute">Пусто</p>
        </div>
      </div>

      <!-- Проекты -->
      <div v-for="p in projects" :key="p.id" class="mb-3" data-test="sphere-project">
        <div class="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
          <form v-if="editingProject === p.id" class="flex flex-1 items-center gap-2" @submit.prevent="saveRename(p.id)">
            <input v-model="editProjectName" class="input !py-1.5" maxlength="120" required autofocus aria-label="Название проекта" @keydown.esc="editingProject = null" />
            <button class="text-xs font-semibold text-accent">OK</button>
          </form>
          <template v-else>
            <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold" @click="collapsed[p.id] = !collapsed[p.id]">
              <span class="truncate">📁 {{ p.name }}</span>
              <span class="shrink-0 font-normal text-mute">· {{ tasksOf(p.id).length }}</span>
              <span class="shrink-0 text-mute">{{ collapsed[p.id] ? '▾' : '▴' }}</span>
            </button>
            <button type="button" class="shrink-0 text-xs text-mute hover:text-accent" aria-label="Переименовать проект" @click="startRename(p.id, p.name)">✎</button>
            <button v-if="app.spheres.length > 1" type="button" class="shrink-0 text-xs text-mute hover:text-accent" :class="moving === p.id && 'text-accent'" :title="'Перенести проект ' + p.name + ' в другую сферу'" @click="moving = moving === p.id ? null : p.id">Перенести</button>
            <button type="button" class="shrink-0 text-xs text-mute hover:text-accent" :title="'Архивировать проект ' + p.name" @click="archiving = p.id">В архив</button>
          </template>
        </div>
        <div v-if="moving === p.id" class="mb-1.5 rounded-xl bg-bg p-2" data-test="move-picker">
          <div class="mb-1.5 text-xs text-mute">Перенести в сферу:</div>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="t in app.spheres.filter(x => x.id !== id)" :key="t.id" type="button" class="chip gap-1.5 py-1 text-xs hover:chip-on" @click="moveProject(p.id, p.name, t.id)">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: t.color }"></span>{{ t.name }}
            </button>
          </div>
        </div>
        <div v-if="!collapsed[p.id]" class="card divide-y divide-line">
          <TaskRow v-for="t in tasksOf(p.id)" :key="t.id" :task="t">
            <span v-if="t.due_date" class="shrink-0 text-xs" :class="dateClass(t.due_date)">{{ dateLabel(t.due_date) }}</span>
          </TaskRow>
          <form class="flex gap-2 px-3 py-2" @submit.prevent="addTo(p.id)">
            <input v-model="quick[p.id]" class="input !py-1.5 text-sm" maxlength="500" :placeholder="'＋ Задача в «' + p.name + '»'" :aria-label="'Новая задача в проекте ' + p.name" />
            <button class="btn-ghost shrink-0 !px-3 !py-1.5" :disabled="!(quick[p.id] ?? '').trim()">+</button>
          </form>
        </div>
      </div>

      <form class="mt-2 flex gap-2" @submit.prevent="addProject">
        <input v-model="newProject" class="input !py-2" maxlength="120" placeholder="Новый проект" aria-label="Новый проект" />
        <button class="btn-ghost shrink-0" :disabled="!newProject.trim()">+ Проект</button>
      </form>

      <!-- Архив проектов -->
      <div v-if="app.archivedProjectsOf(id).length" class="mt-3">
        <button type="button" class="text-xs font-semibold text-mute" @click="showArchive = !showArchive">Архив проектов ({{ app.archivedProjectsOf(id).length }}) {{ showArchive ? '▴' : '▾' }}</button>
        <ul v-if="showArchive" class="mt-1.5 divide-y divide-line rounded-xl border border-line bg-white">
          <li v-for="p in app.archivedProjectsOf(id)" :key="p.id" class="flex items-center gap-2 px-3 py-2 text-sm text-mute" data-test="archived-project">
            <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
            <button type="button" class="shrink-0 text-xs font-semibold text-accent" :aria-label="'Вернуть проект ' + p.name" @click="app.restoreProject(p.id)">Вернуть</button>
            <button type="button" class="shrink-0 text-xs hover:text-red-600" aria-label="Удалить проект" @click="removeProject(p.id, p.name)">Удалить</button>
          </li>
        </ul>
      </div>

      <DoneBlock :tasks="doneTasks" :since="weekStart(app.today)" />
    </section>

    <!-- Привычки -->
    <section class="mb-6">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-mute">Привычки</h2>
        <button class="text-sm font-semibold text-accent" @click="showHabitForm = !showHabitForm">{{ showHabitForm ? 'Закрыть' : '+ Привычка' }}</button>
      </div>
      <HabitForm v-if="showHabitForm" class="mb-3" :sphere-id="id" @done="showHabitForm = false" />
      <div v-if="habits.length" class="card divide-y divide-line">
        <HabitRow v-for="h in habits" :key="h.id" :habit="h" />
      </div>
      <p v-else-if="!showHabitForm" class="text-sm text-mute">В этой сфере привычек нет.</p>
    </section>

    <!-- Повторяющиеся задачи -->
    <section class="mb-6">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-mute">Повторы</h2>
        <button class="text-sm font-semibold text-accent" @click="showRecForm = !showRecForm">{{ showRecForm ? 'Закрыть' : '+ Повтор' }}</button>
      </div>
      <RecurrenceForm v-if="showRecForm" class="mb-3" :sphere-id="id" @done="showRecForm = false" />
      <ul v-if="recurrences.length" class="card divide-y divide-line">
        <li v-for="r in recurrences" :key="r.id" class="flex items-center gap-3 px-3 py-2.5">
          <div class="min-w-0 flex-1"><div class="truncate text-[15px]">↻ {{ r.title }}</div><div class="text-xs text-mute">{{ describe(r) }}</div></div>
          <button class="text-xs text-mute hover:text-red-600" @click="removeRecurrence(r.id, r.title)">Удалить</button>
        </li>
      </ul>
      <p v-else-if="!showRecForm" class="text-sm text-mute">Повторяющихся задач нет.</p>
    </section>

    <ProjectArchive v-if="archiving" :project-id="archiving" @close="archiving = null" />
  </template>
</template>
