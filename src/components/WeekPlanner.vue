<script setup lang="ts">
import { computed, ref, type Directive } from 'vue'
import { useApp } from '../stores/app'
import { addDays, fmtMinutes, shortDate } from '../lib/time'
import { dragToDay } from '../lib/dragToDay'
import { byPosition } from '../lib/taskOrder'
import type { Task } from '../types'
import TaskRow from './TaskRow.vue'

/**
 * Планирование недели в итоге: полоска из 7 дней (всегда видна при прокрутке — на неё можно бросать задачи),
 * под ней — задачи выбранного дня, затем «Входящие», «Отложено без даты» и проекты. Каждой задаче можно выбрать день
 * из списка или перетащить её за ⋮⋮ на день в полоске
 */
const props = defineProps<{ weekStart: string }>()
const app = useApp()
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(props.weekStart, i)))
const sel = ref(props.weekStart)

const sortDay = (a: Task, b: Task) => byPosition(a, b) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99')
const tasksOn = (d: string) => app.data.tasks.filter(t => t.due_date === d && t.status !== 'done' && t.status !== 'inbox').sort(sortDay)
const dayInfo = computed(() => Object.fromEntries(days.value.map(d => {
  const list = tasksOn(d)
  return [d, { count: list.length, minutes: list.reduce((s, t) => s + (t.estimate_minutes ?? 0), 0) }]
})))
const selTasks = computed(() => tasksOn(sel.value))

const staleIds = computed(() => new Set(app.staleDeferred.map(t => t.id)))
/** Проекты по сферам: только с невыполненными задачами */
const projectGroups = computed(() => app.spheres.map(s => ({
  sphere: s,
  projects: app.projectsOf(s.id)
    .map(p => ({ project: p, tasks: app.data.tasks.filter(t => t.project_id === p.id && t.status !== 'done').sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || byPosition(a, b)) }))
    .filter(x => x.tasks.length),
})).filter(g => g.projects.length))
const openSpheres = ref<Record<string, boolean>>({})
const show = ref({ inbox: true, deferred: app.deferred.length <= 10, projects: false })

const msg = ref('')
/** Поставить задачу на день (или '' — без даты, в «Отложено») */
async function schedule(id: string, day: string) {
  const t = app.data.tasks.find(x => x.id === id); if (!t) return
  if (day && t.due_date === day) return
  if (day && t.recurrence_id && app.data.tasks.some(x => x.recurrence_id === t.recurrence_id && x.due_date === day && x.id !== id)) {
    msg.value = `В этот день уже есть «${t.title}» по тому же повтору.`; return
  }
  await app.updateTask(id, day ? { due_date: day, status: 'planned' } : { due_date: null, start_time: null, remind_before_minutes: null, status: 'planned' })
  if (!app.error) msg.value = day ? `«${t.title}» → ${WD[days.value.indexOf(day)] ?? ''} ${shortDate(day)}` : `«${t.title}» → без даты`
}
function onPick(id: string, e: Event) {
  const el = e.target as HTMLSelectElement
  const v = el.value; el.value = '-'
  if (v !== '-') void schedule(id, v)
}
const dateNote = (t: Task) => (t.due_date ? shortDate(t.due_date) : 'без даты')
const vDragToDay: Directive<HTMLElement & { _dd?: () => void }> = {
  mounted(el) { el._dd = dragToDay(el, () => ({ drop: (id, day) => void schedule(id, day), shiftMonth: () => {} })) },
  unmounted(el) { el._dd?.() },
}
</script>

<template>
  <section v-drag-to-day class="mb-5" data-test="week-planner">
    <h2 class="mb-1 text-sm font-semibold uppercase tracking-wide text-mute">Планирование недели · {{ shortDate(days[0]) }} – {{ shortDate(days[6]) }}</h2>
    <p class="mb-2 text-xs text-mute">Разбери входящие и отложенное, загляни в проекты. День выбирается в списке 📅 у задачи или перетаскиванием за ⋮⋮ на день в полоске.</p>

    <!-- Неделя: всегда на виду при прокрутке, сюда бросают задачи -->
    <div class="sticky top-[var(--timer-h,0px)] z-10 -mx-1 bg-bg px-1 pb-2 pt-1">
      <div class="grid grid-cols-7 gap-1">
        <button v-for="(d, i) in days" :key="d" type="button" :data-day="d" :aria-pressed="sel === d" data-test="plan-day"
          class="flex flex-col items-center rounded-xl border px-0.5 py-1.5 text-center transition"
          :class="sel === d ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-white'"
          :aria-label="`${WD[i]}, ${shortDate(d)}: задач ${dayInfo[d].count}${dayInfo[d].minutes ? ', ≈ ' + fmtMinutes(dayInfo[d].minutes) : ''}`" @click="sel = d">
          <span class="text-[11px] text-mute">{{ WD[i] }}</span>
          <span class="text-sm font-semibold leading-tight">{{ Number(d.slice(8)) }}</span>
          <span class="text-[11px] font-medium" :class="dayInfo[d].count ? 'text-ink' : 'text-mute/60'">{{ dayInfo[d].count || '—' }}</span>
          <span v-if="dayInfo[d].minutes" class="text-[9px] leading-none text-mute">≈{{ fmtMinutes(dayInfo[d].minutes) }}</span>
        </button>
      </div>
      <p v-if="msg" class="mt-1 text-xs text-accent" data-test="plan-msg">{{ msg }}</p>
    </div>

    <!-- Выбранный день -->
    <div class="mb-4">
      <div class="mb-1 text-sm font-semibold">{{ WD[days.indexOf(sel)] }}, {{ shortDate(sel) }}</div>
      <div v-if="selTasks.length" class="card divide-y divide-line" data-test="plan-day-tasks">
        <div v-for="t in selTasks" :key="t.id" :data-task-id="t.id" class="flex items-center">
          <span data-drag-handle class="shrink-0 cursor-grab touch-none select-none py-3 pl-2 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить задачу на другой день">⋮⋮</span>
          <TaskRow :task="t" class="min-w-0 flex-1" no-timer>
            <select class="input !w-12 shrink-0 !px-1.5 !py-1 !text-sm" aria-label="Перенести на другой день" @change="onPick(t.id, $event)">
              <option value="-">📅</option>
              <option v-for="(d, i) in days" :key="d" :value="d" :disabled="d === sel">{{ WD[i] }} {{ shortDate(d) }}</option>
              <option value="">Без даты</option>
            </select>
          </TaskRow>
        </div>
      </div>
      <p v-else class="text-sm text-mute">На этот день задач пока нет.</p>
    </div>

    <!-- Шаг 1. Входящие -->
    <div class="mb-3">
      <button type="button" class="mb-1 flex w-full items-center justify-between text-left text-sm font-semibold" :aria-expanded="show.inbox" @click="show.inbox = !show.inbox">
        <span>1. Входящие · {{ app.inbox.length }}</span><span class="text-mute">{{ show.inbox ? '▴' : '▾' }}</span>
      </button>
      <template v-if="show.inbox">
        <div v-if="app.inbox.length" class="card divide-y divide-line" data-test="plan-inbox">
          <div v-for="t in app.inbox" :key="t.id" :data-task-id="t.id" class="flex items-center">
            <span data-drag-handle class="shrink-0 cursor-grab touch-none select-none py-3 pl-2 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить задачу на день">⋮⋮</span>
            <TaskRow :task="t" class="min-w-0 flex-1" no-timer>
              <select class="input !w-12 shrink-0 !px-1.5 !py-1 !text-sm" aria-label="Запланировать на день" data-test="plan-pick" @change="onPick(t.id, $event)">
                <option value="-">📅</option>
                <option v-for="(d, i) in days" :key="d" :value="d">{{ WD[i] }} {{ shortDate(d) }}</option>
                <option value="">Без даты</option>
              </select>
            </TaskRow>
          </div>
        </div>
        <p v-else class="text-sm text-mute">Во «Входящих» пусто ✨</p>
      </template>
    </div>

    <!-- Шаг 2. Отложено без даты -->
    <div v-if="app.deferred.length" class="mb-3">
      <button type="button" class="mb-1 flex w-full items-center justify-between text-left text-sm font-semibold" :aria-expanded="show.deferred" @click="show.deferred = !show.deferred">
        <span>2. Отложено без даты · {{ app.deferred.length }}<span v-if="app.staleDeferred.length" class="font-normal text-amber-800"> · давно не трогала: {{ app.staleDeferred.length }}</span></span>
        <span class="text-mute">{{ show.deferred ? '▴' : '▾' }}</span>
      </button>
      <div v-if="show.deferred" class="card divide-y divide-line" data-test="plan-deferred">
        <div v-for="t in app.deferred" :key="t.id" :data-task-id="t.id" class="flex items-center" :class="staleIds.has(t.id) && 'bg-amber-50'">
          <span data-drag-handle class="shrink-0 cursor-grab touch-none select-none py-3 pl-2 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить задачу на день">⋮⋮</span>
          <TaskRow :task="t" class="min-w-0 flex-1" no-timer>
            <select class="input !w-12 shrink-0 !px-1.5 !py-1 !text-sm" aria-label="Запланировать на день" @change="onPick(t.id, $event)">
              <option value="-">📅</option>
              <option v-for="(d, i) in days" :key="d" :value="d">{{ WD[i] }} {{ shortDate(d) }}</option>
            </select>
          </TaskRow>
        </div>
      </div>
    </div>

    <!-- Шаг 3. Проекты -->
    <div v-if="projectGroups.length">
      <button type="button" class="mb-1 flex w-full items-center justify-between text-left text-sm font-semibold" :aria-expanded="show.projects" data-test="plan-projects-toggle" @click="show.projects = !show.projects">
        <span>{{ app.deferred.length ? 3 : 2 }}. Проекты</span><span class="text-mute">{{ show.projects ? '▴' : '▾' }}</span>
      </button>
      <div v-if="show.projects" class="space-y-2" data-test="plan-projects">
        <div v-for="g in projectGroups" :key="g.sphere.id">
          <button type="button" class="flex w-full items-center gap-2 py-1 text-left text-sm" :aria-expanded="!!openSpheres[g.sphere.id]" @click="openSpheres[g.sphere.id] = !openSpheres[g.sphere.id]">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ background: g.sphere.color }"></span>
            <span class="flex-1 font-medium">{{ g.sphere.name }}</span>
            <span class="text-xs text-mute">проектов: {{ g.projects.length }} {{ openSpheres[g.sphere.id] ? '▴' : '▾' }}</span>
          </button>
          <div v-if="openSpheres[g.sphere.id]" class="space-y-2 pl-4">
            <div v-for="x in g.projects" :key="x.project.id">
              <div class="mb-1 flex items-center justify-between text-xs font-semibold text-mute">
                <span>{{ x.project.name }} · {{ x.tasks.length }}</span>
                <RouterLink :to="'/spheres/' + g.sphere.id" class="font-normal text-accent">открыть сферу ›</RouterLink>
              </div>
              <div class="card divide-y divide-line">
                <div v-for="t in x.tasks" :key="t.id" :data-task-id="t.id" class="flex items-center">
                  <span data-drag-handle class="shrink-0 cursor-grab touch-none select-none py-3 pl-2 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить задачу на день">⋮⋮</span>
                  <TaskRow :task="t" class="min-w-0 flex-1" no-timer>
                    <span class="shrink-0 text-xs text-mute">{{ dateNote(t) }}</span>
                    <select class="input !w-12 shrink-0 !px-1.5 !py-1 !text-sm" aria-label="Запланировать на день" @change="onPick(t.id, $event)">
                      <option value="-">📅</option>
                      <option v-for="(d, i) in days" :key="d" :value="d">{{ WD[i] }} {{ shortDate(d) }}</option>
                    </select>
                  </TaskRow>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
