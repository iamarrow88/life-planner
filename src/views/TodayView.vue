<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { addDays, dayOf, longDate, shortDate, hhmm } from '../lib/time'
import TaskRow from '../components/TaskRow.vue'
import HabitRow from '../components/HabitRow.vue'
import HabitForm from '../components/HabitForm.vue'
import RecurrenceForm from '../components/RecurrenceForm.vue'
import AutoTextarea from '../components/AutoTextarea.vue'
import EstimateInput from '../components/EstimateInput.vue'
import DoneBlock from '../components/DoneBlock.vue'
import { describe } from '../lib/recurrence'
import type { Task } from '../types'

const app = useApp()
type Filter = 'today' | 'tomorrow' | 'week' | 'nodate'
const filters: { v: Filter; label: string }[] = [
  { v: 'today', label: 'Сегодня' }, { v: 'tomorrow', label: 'Завтра' }, { v: 'week', label: 'Неделя' }, { v: 'nodate', label: 'Без даты' },
]
const view = ref<'list' | 'cal'>('list')
const filter = ref<Filter>('today')
const calDay = ref(app.today)
const text = ref('')
const estimate = ref<number | null>(null)
const showHabitForm = ref(false)
const isSunday = computed(() => new Date().getDay() === 0)
const reviewDone = computed(() => !!app.currentReview?.completed_at)
const showRecForm = ref(false)
const showRules = ref(false)

const planned = computed(() => app.data.tasks.filter(t => t.status !== 'inbox'))
/** Невыполненные: выполненные уезжают в блок «Выполнено» внизу */
const pending = computed(() => planned.value.filter(t => t.status !== 'done'))
const sortTasks = (a: Task, b: Task) =>
  Number(a.status === 'done') - Number(b.status === 'done') ||
  (a.due_date ?? '').localeCompare(b.due_date ?? '') ||
  (a.start_time ?? '99').localeCompare(b.start_time ?? '99')

const list = computed(() => {
  const t = app.today
  const week = addDays(t, 7)
  return pending.value.filter(x => {
    if (filter.value === 'today') return x.due_date === t || (!!x.due_date && x.due_date < t)
    if (filter.value === 'tomorrow') return x.due_date === addDays(t, 1)
    if (filter.value === 'week') return !!x.due_date && x.due_date >= t && x.due_date <= week
    return !x.due_date
  }).sort(sortTasks)
})
/** Выполненные задачи выбранного фильтра («Сегодня» — ещё и просроченные, закрытые сегодня) */
const doneList = computed(() => {
  const t = app.today
  const week = addDays(t, 7)
  return planned.value.filter(x => {
    if (x.status !== 'done') return false
    if (filter.value === 'today') return x.due_date === t || (!!x.due_date && x.due_date < t && !!x.done_at && dayOf(x.done_at) === t)
    if (filter.value === 'tomorrow') return x.due_date === addDays(t, 1)
    if (filter.value === 'week') return !!x.due_date && x.due_date >= t && x.due_date <= week
    return !x.due_date
  })
})
const overdueCount = computed(() => planned.value.filter(x => x.due_date && x.due_date < app.today && x.status !== 'done').length)

const hours = Array.from({ length: 17 }, (_, i) => i + 6) // 6:00 … 22:00
const timedOnDay = computed(() => planned.value.filter(t => t.due_date === calDay.value && t.start_time).sort(sortTasks))
const untimedOnDay = computed(() => planned.value.filter(t => t.due_date === calDay.value && !t.start_time).sort(sortTasks))
/** «08:00–08:45», если задана оценка времени */
const timeRange = (t: Task) => {
  const start = hhmm(t.start_time)
  if (!t.estimate_minutes) return start
  const end = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + t.estimate_minutes
  return `${start}–${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}
const hourOf = (t: Task) => Math.min(22, Math.max(6, Number(hhmm(t.start_time).slice(0, 2))))

const habits = computed(() => app.dueHabits)
const showLater = ref(false)

async function add() {
  const title = text.value.trim()
  if (!title) return
  const est = estimate.value
  text.value = ''; estimate.value = null
  const due = filter.value === 'tomorrow' ? addDays(app.today, 1) : filter.value === 'nodate' ? null : app.today
  await app.addTask({ title, status: due ? 'planned' : 'inbox', due_date: due, estimate_minutes: est })
}
</script>

<template>
  <div class="mb-4 flex items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-bold">Сегодня</h1>
      <p class="text-sm text-mute first-letter:uppercase">{{ longDate(app.today) }}</p>
    </div>
    <div class="flex rounded-xl border border-line bg-white p-0.5 text-sm font-medium">
      <button class="rounded-lg px-3 py-1.5" :class="view === 'list' ? 'bg-accent text-white' : 'text-mute'" @click="view = 'list'">Список</button>
      <button class="rounded-lg px-3 py-1.5" :class="view === 'cal' ? 'bg-accent text-white' : 'text-mute'" @click="view = 'cal'">Календарь</button>
    </div>
  </div>

  <RouterLink v-if="isSunday && !reviewDone" to="/review" class="card mb-4 flex items-center gap-3 border-accent bg-accent-soft p-4">
    <span class="text-2xl">📋</span>
    <span class="flex-1"><span class="block font-semibold text-accent">Воскресенье — время подвести итог недели</span><span class="text-sm text-mute">Посмотри цифры, ответь на три вопроса и поставь цели на следующую неделю</span></span>
    <span class="text-accent">›</span>
  </RouterLink>

  <!-- Привычки на сегодня -->
  <section class="mb-6">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-mute">Привычки</h2>
      <button class="text-sm font-semibold text-accent" @click="showHabitForm = !showHabitForm">{{ showHabitForm ? 'Закрыть' : '+ Привычка' }}</button>
    </div>
    <HabitForm v-if="showHabitForm" class="mb-3" @done="showHabitForm = false" />
    <div v-if="habits.length" class="card divide-y divide-line">
      <HabitRow v-for="h in habits" :key="h.id" :habit="h" />
    </div>
    <p v-else-if="!showHabitForm && !app.laterHabits.length" class="text-sm text-mute">Привычек пока нет.</p>
    <p v-else-if="!showHabitForm" class="text-sm text-mute">На сегодня привычек нет.</p>
    <div v-if="app.laterHabits.length" class="mt-2">
      <button type="button" class="text-xs font-semibold text-mute" :aria-expanded="showLater" @click="showLater = !showLater">Не сегодня ({{ app.laterHabits.length }}) {{ showLater ? '▴' : '▾' }}</button>
      <div v-if="showLater" class="card mt-1.5 divide-y divide-line" data-test="later-habits">
        <HabitRow v-for="h in app.laterHabits" :key="h.id" :habit="h" />
      </div>
    </div>
  </section>

  <!-- Список -->
  <template v-if="view === 'list'">
    <div class="mb-3 flex flex-wrap gap-2">
      <button v-for="f in filters" :key="f.v" class="chip py-1.5 text-sm" :class="filter === f.v && 'chip-on'" @click="filter = f.v">{{ f.label }}</button>
    </div>
    <p v-if="filter === 'today' && overdueCount" class="mb-2 text-xs text-amber-700">Просрочено: {{ overdueCount }} — они показаны вверху списка.</p>
    <form class="mb-3 flex flex-wrap items-start gap-2" @submit.prevent="add">
      <AutoTextarea v-model="text" single-line :maxlength="500" class="!w-auto min-w-[10rem] flex-1" placeholder="Новое дело…" @submit="add" />
      <EstimateInput v-model="estimate" />
      <button class="btn-primary shrink-0" :disabled="!text.trim()">+</button>
      <button type="button" class="btn-ghost shrink-0" title="Повторяющаяся задача" @click="showRecForm = !showRecForm">↻</button>
    </form>
    <RecurrenceForm v-if="showRecForm" class="mb-3" @done="showRecForm = false" />
    <div v-if="list.length" class="card divide-y divide-line">
      <div v-for="t in list" :key="t.id">
        <TaskRow :task="t">
          <span v-if="t.due_date && (filter === 'week' || t.due_date < app.today)" class="shrink-0 text-xs" :class="t.due_date < app.today ? 'text-amber-700' : 'text-mute'">{{ shortDate(t.due_date) }}</span>
        </TaskRow>
      </div>
    </div>
    <div v-else class="card p-8 text-center text-mute">Здесь пока ничего нет</div>

    <DoneBlock :tasks="doneList" />

    <section v-if="app.data.recurrences.length" class="mt-6">
      <button class="text-sm font-semibold text-accent" @click="showRules = !showRules">↻ Повторы ({{ app.data.recurrences.length }}) {{ showRules ? '▴' : '▾' }}</button>
      <ul v-if="showRules" class="card mt-2 divide-y divide-line">
        <li v-for="r in app.data.recurrences" :key="r.id" class="flex items-center gap-3 px-3 py-2.5">
          <div class="min-w-0 flex-1"><div class="truncate text-[15px]">{{ r.title }}</div><div class="text-xs text-mute">{{ describe(r) }}</div></div>
          <button class="text-xs text-mute hover:text-red-600" @click="app.removeRecurrence(r.id)">Удалить</button>
        </li>
      </ul>
    </section>
  </template>

  <!-- Календарь дня: сверху задачи без времени, ниже сетка часов -->
  <template v-else>
    <div class="mb-3 flex items-center justify-between">
      <button class="btn-ghost !px-3" @click="calDay = addDays(calDay, -1)">‹</button>
      <button class="text-sm font-semibold first-letter:uppercase" @click="calDay = app.today">{{ longDate(calDay) }}</button>
      <button class="btn-ghost !px-3" @click="calDay = addDays(calDay, 1)">›</button>
    </div>
    <div v-if="untimedOnDay.length" class="mb-3">
      <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-mute">Без времени</div>
      <div class="card divide-y divide-line">
        <TaskRow v-for="t in untimedOnDay" :key="t.id" :task="t" />
      </div>
    </div>
    <div class="card divide-y divide-line">
      <div v-for="h in hours" :key="h" class="flex min-h-[3.25rem]">
        <div class="w-14 shrink-0 px-3 py-2 text-xs text-mute">{{ String(h).padStart(2, '0') }}:00</div>
        <div class="min-w-0 flex-1 space-y-1 border-l border-line p-1">
          <template v-for="t in timedOnDay" :key="t.id">
            <div v-if="hourOf(t) === h" class="rounded-xl border-l-4 bg-accent-soft"
              :style="{ borderColor: app.sphereById(t.sphere_id)?.color ?? '#1F6F6B' }">
              <TaskRow :task="t"><span class="shrink-0 text-xs text-mute">{{ timeRange(t) }}</span></TaskRow>
            </div>
          </template>
        </div>
      </div>
    </div>
  </template>
</template>
