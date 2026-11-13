<script setup lang="ts">
import { computed, ref, watch, type Directive } from 'vue'
import { useApp } from '../stores/app'
import { addDays, dayOf, fmtMinutes, longDate, shortDate, hhmm, weekStart } from '../lib/time'
import TaskRow from '../components/TaskRow.vue'
import HabitRow from '../components/HabitRow.vue'
import HabitForm from '../components/HabitForm.vue'
import RecurrenceForm from '../components/RecurrenceForm.vue'
import AutoTextarea from '../components/AutoTextarea.vue'
import EstimateInput from '../components/EstimateInput.vue'
import ComplexityPicker from '../components/ComplexityPicker.vue'
import DayOverload from '../components/DayOverload.vue'
import DayTaskForm from '../components/DayTaskForm.vue'
import DoneBlock from '../components/DoneBlock.vue'
import PillCheck from '../components/PillCheck.vue'
import QuickTags from '../components/QuickTags.vue'
import TagBar from '../components/TagBar.vue'
import TaskFilter from '../components/TaskFilter.vue'
import { useTaskFilter } from '../lib/taskFilter'
import { layoutDay } from '../lib/dayGrid'
import MonthGrid from '../components/MonthGrid.vue'
import { GENERATED_DAYS, OVERDUE_COLOR, fmtLoad, monthSummary } from '../lib/monthMarks'
import { matches } from '../lib/recurrence'
import { budgetSum, fmtMoney } from '../lib/budget'
import { dragToDay } from '../lib/dragToDay'
import { dragSort } from '../lib/dragSort'
import { byPosition } from '../lib/taskOrder'
import { emptyCollapse, nextCollapse, splitHabits, type CollapseState } from '../lib/habitCollapse'
import type { Habit, HabitDay, Task } from '../types'
import SettingsLink from '../components/SettingsLink.vue'
import Icon from '../components/Icon.vue'

const app = useApp()
// Отбор по сфере / проекту — свой у «Сегодня»: действует на списки, сетку дня, месяц и сводку
const { filter: taskFilter, active: filterOn, match, newTaskFields } = useTaskFilter('today')
const fTasks = computed(() => (filterOn.value ? app.data.tasks.filter(match) : app.data.tasks))
const fRecurrences = computed(() => (filterOn.value ? app.data.recurrences.filter(match) : app.data.recurrences))

// ---- Выбранный день (полоса недели сверху) и вид: список дня, сетка часов, месяц или задачи без даты.
// Список или сетку помним на этом устройстве
const selDay = ref(app.today)
type Mode = 'list' | 'grid' | 'month' | 'nodate'
const DAY_MODE_KEY = 'planner-day-mode'
const dayMode = ref<'list' | 'grid'>((() => { try { return localStorage.getItem(DAY_MODE_KEY) === 'grid' ? 'grid' : 'list' } catch { return 'list' } })())
const mode = ref<Mode>(dayMode.value)
function setDayMode(m: 'list' | 'grid') {
  dayMode.value = m; mode.value = m
  try { localStorage.setItem(DAY_MODE_KEY, m) } catch { /* не страшно */ }
}
/** Что показывать в дне: всё, только задачи или только привычки */
const show = ref<'all' | 'tasks' | 'habits'>('all')
const shows = [{ v: 'all', label: 'Все' }, { v: 'tasks', label: 'Задачи' }, { v: 'habits', label: 'Привычки' }] as const
const isDay = computed(() => mode.value === 'list' || mode.value === 'grid')
function pickStripDay(d: string) { selDay.value = d; if (!isDay.value) mode.value = dayMode.value }
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart(selDay.value), i)))
const wdOf = (d: string) => WD[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7]
/** Точки под днём полосы: есть невыполненные задачи и/или день перегружен */
const hasPending = (d: string) => fTasks.value.some(t => t.due_date === d && t.status !== 'done' && t.status !== 'inbox')

// ---- Месяц: открывается по нажатию на название месяца
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const monthTitle = computed(() => MONTHS_NOM[Number((mode.value === 'month' ? calMonth.value : selDay.value).slice(5, 7)) - 1])
const calMonth = ref(app.today.slice(0, 7))
function toggleMonth() {
  if (mode.value === 'month') { mode.value = dayMode.value; return }
  calMonth.value = selDay.value.slice(0, 7); monthSel.value = selDay.value; mode.value = 'month'
}
/** «Открыть день» в месяце — список этого дня */
function openDay(d: string) { selDay.value = d; mode.value = dayMode.value }
// ---- Выбранный день месяца: его задачи под сеткой, их можно перетащить на другой день
const monthSel = ref(app.today)
/** Первое нажатие выбирает день, повторное — открывает его */
function pickDay(d: string) { moveMsg.value = ''; if (monthSel.value === d) openDay(d); else monthSel.value = d }
const selTasks = computed(() => planned.value.filter(t => t.due_date === monthSel.value).sort(sortTasks))
/** Дела по повторам, которые на этот день ещё не созданы (дальше 30 дней) — перетащить их нельзя */
const selVirtual = computed(() => monthSel.value <= addDays(app.today, GENERATED_DAYS) ? [] : fRecurrences.value
  .filter(r => r.mode === 'schedule' && matches(r, monthSel.value) && !selTasks.value.some(t => t.recurrence_id === r.id)))
const monthGrid = ref<{ shift(n: number): void } | null>(null)
const moveMsg = ref('')
async function moveTask(id: string, day: string) {
  const t = app.data.tasks.find(x => x.id === id)
  if (!t || t.due_date === day) return
  if (t.recurrence_id && app.data.tasks.some(x => x.recurrence_id === t.recurrence_id && x.due_date === day)) {
    moveMsg.value = `В этот день уже есть «${t.title}» по тому же повтору.`; return
  }
  // со «Входящих» задача с датой уходит в план
  await app.updateTask(id, { due_date: day, ...(t.status === 'inbox' ? { status: 'planned' as const } : {}) })
  if (!app.error) { moveMsg.value = `«${t.title}» → ${shortDate(day)}`; monthSel.value = day }
}
const vDragToDay: Directive<HTMLElement & { _dd?: () => void }> = {
  mounted(el) { el._dd = dragToDay(el, () => ({ drop: moveTask, shiftMonth: n => monthGrid.value?.shift(n) })) },
  unmounted(el) { el._dd?.() },
}
/** Дни вокруг месяца с запасом: сетка начинается не раньше чем за 6 дней до 1-го и занимает не больше 6 недель */
const monthDays = computed(() => Array.from({ length: 49 }, (_, i) => addDays(calMonth.value + '-01', i - 7)))
/** Первый день, который видно: старые выполненные задачи до него подгружаются */
const shownFrom = computed(() => (mode.value === 'month' ? monthDays.value[0] : [weekStart(selDay.value), app.today].sort()[0]))
watch([shownFrom, () => app.tasksFrom], ([d]) => { void app.ensureTasksFrom(d) }, { immediate: true })
const summary = computed(() => monthSummary(monthDays.value, app.today, fTasks.value, fRecurrences.value, app.spheres))
const MAX_MARKS = 3

// ---- Бюджет за то, что сейчас на экране: выбранный день, задачи без даты или месяц (текущий — до конца)
const budgetPeriod = computed((): { range: { from: string; to: string } | 'nodate'; label: string } => {
  const t = app.today
  if (mode.value === 'nodate') return { range: 'nodate', label: 'без даты' }
  if (mode.value !== 'month') return { range: { from: selDay.value, to: selDay.value }, label: selDay.value === t ? 'на сегодня' : `на ${shortDate(selDay.value)}` }
  const [y, m] = calMonth.value.split('-').map(Number)
  const last = `${calMonth.value}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
  if (calMonth.value === t.slice(0, 7)) return { range: { from: t, to: last }, label: `до конца ${MONTHS_GEN[m - 1]} (${shortDate(t)} – ${shortDate(last)})` }
  return { range: { from: calMonth.value + '-01', to: last }, label: `на ${MONTHS_NOM[m - 1]}${y !== Number(t.slice(0, 4)) ? ' ' + y : ''}` }
})
const budget = computed(() => app.showBudget ? budgetSum(fTasks.value, fRecurrences.value, app.today, budgetPeriod.value.range) : null)
const hasBudget = computed(() => !!budget.value && (budget.value.count > 0 || budget.value.overdue > 0))
const text = ref('')
const estimate = ref<number | null>(null)
const showHabitForm = ref(false)
const isSunday = computed(() => new Date().getDay() === 0)
const reviewDone = computed(() => !!app.currentReview?.completed_at)
const showRecForm = ref(false)

const planned = computed(() => fTasks.value.filter(t => t.status !== 'inbox'))
/** Невыполненные: выполненные уезжают в блок «Выполнено» внизу */
const pending = computed(() => planned.value.filter(t => t.status !== 'done'))
/** Внутри дня — свой порядок (перетаскиванием), а задачи, которые не двигали, — по времени начала */
const sortTasks = (a: Task, b: Task) =>
  Number(a.status === 'done') - Number(b.status === 'done') ||
  (a.due_date ?? '').localeCompare(b.due_date ?? '') ||
  byPosition(a, b) ||
  (a.start_time ?? '99').localeCompare(b.start_time ?? '99')
/** Перетащили задачу в списке — запоминаем новый порядок */
const onTaskSort = (ids: string[]) => { void app.reorderTasks(ids) }

/** Задачи дня: на сегодня — ещё и просроченные (они вверху); «Без даты» — разобранные без срока и неразобранные из «Входящих» */
const list = computed(() => {
  if (mode.value === 'nodate') return [...pending.value.filter(x => !x.due_date), ...app.inbox.filter(match)].sort(byPosition)
  const d = selDay.value
  return pending.value.filter(x => x.due_date === d || (d === app.today && !!x.due_date && x.due_date < d)).sort(sortTasks)
})
/** Выполненные задачи дня («Сегодня» — ещё и просроченные, закрытые сегодня) */
const doneList = computed(() => planned.value.filter(x => {
  if (x.status !== 'done') return false
  if (mode.value === 'nodate') return !x.due_date
  const d = selDay.value
  return x.due_date === d || (d === app.today && !!x.due_date && x.due_date < d && !!x.done_at && dayOf(x.done_at) === d)
}))
const overdueCount = computed(() => planned.value.filter(x => x.due_date && x.due_date < app.today && x.status !== 'done').length)

// ---- Сводка дня: время, бюджет, перегруз и просрочка одной строкой. Если что-то не так — строка янтарная и раскрыта
const plannedMin = computed(() => (selDay.value === app.today ? app.plannedTodayMinutes
  : pending.value.filter(t => t.due_date === selDay.value).reduce((s, t) => s + (t.estimate_minutes ?? 0), 0)))
const freeMin = computed(() => (selDay.value === app.today ? app.freeTodayMinutes : null))
const overload = computed(() => app.overloadOn(selDay.value))
const overTime = computed(() => freeMin.value != null && plannedMin.value > freeMin.value)
const todayOverdue = computed(() => (selDay.value === app.today ? overdueCount.value : 0))
const alert = computed(() => overload.value.length > 0 || overTime.value || todayOverdue.value > 0 || (budget.value?.overdue ?? 0) > 0)
const hasSummary = computed(() => isDay.value && (plannedMin.value > 0 || hasBudget.value || alert.value))
const sumOpenManual = ref<boolean | null>(null)
watch(selDay, () => { sumOpenManual.value = null })
const sumOpen = computed(() => sumOpenManual.value ?? alert.value)
const hrs = (m: number) => fmtMinutes(Math.round(m))

const hours = Array.from({ length: 17 }, (_, i) => i + 6) // 6:00 … 22:00
const timedOnDay = computed(() => planned.value.filter(t => t.due_date === selDay.value && t.start_time).sort(sortTasks))
const untimedOnDay = computed(() => planned.value.filter(t => t.due_date === selDay.value && !t.start_time).sort(sortTasks))
/** «08:00–08:45», если задана оценка времени */
const timeRange = (t: Task) => {
  const start = hhmm(t.start_time)
  if (!t.estimate_minutes) return start
  const end = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + t.estimate_minutes
  return `${start}–${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}
/** Раскладка сетки дня: короткие задачи — в ячейке часа по порядку времени, от часа — растянуты на свои часы */
const dayLayout = computed(() => layoutDay(timedOnDay.value, hours[0], hours[hours.length - 1]))
const blockColor = (t: Task) => ({ borderColor: app.sphereById(t.sphere_id)?.color ?? '#6B63A3' })

const habits = computed(() => app.dueHabits)

// ---- Сворачивание привычек (если их больше 4): выполненные прячутся, их место занимают невыполненные
const COLLAPSE_KEY = 'planner-habit-collapse'
function loadCollapse(): CollapseState {
  try {
    const s = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? 'null') as CollapseState | null
    if (s && s.day === app.today && Array.isArray(s.hidden) && Array.isArray(s.kept)) return s
  } catch { /* без хранилища просто начинаем заново */ }
  return emptyCollapse(app.today)
}
const collapse = ref<CollapseState>(loadCollapse())
let prevDone: Set<string> | null = null
const doneIds = computed(() => new Set(habits.value.filter(h => app.habitIsDone(h)).map(h => h.id)))
watch(doneIds, now => {
  if (collapse.value.day !== app.today) { collapse.value = emptyCollapse(app.today); prevDone = null }
  if (prevDone) collapse.value = nextCollapse(collapse.value, prevDone, now, habits.value.length)
  prevDone = new Set(now)
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapse.value)) } catch { /* не страшно */ }
}, { immediate: true })
const habitSplit = computed(() => splitHabits(habits.value.map(h => h.id), doneIds.value, collapse.value))
const habitById = (id: string) => habits.value.find(h => h.id === id)!
const visibleHabits = computed(() => habitSplit.value.visible.map(habitById))
const restHabits = computed(() => [...habitSplit.value.queued, ...habitSplit.value.hiddenDone].map(habitById))
const showRest = ref(false)
const restLabel = computed(() => {
  const q = habitSplit.value.queued.length, d = habitSplit.value.hiddenDone.length
  return [d ? `выполнено: ${d}` : '', q ? `в очереди: ${q}` : ''].filter(Boolean).join(', ')
})
async function onHabitSort(ids: string[]) { await app.reorderHabits(ids) }
/** v-drag-sort: перетаскивание за ручку; колбэк берётся свежий при каждом обновлении */
const vDragSort: Directive<HTMLElement & { _ds?: () => void; _cb?: (ids: string[]) => void }, (ids: string[]) => void> = {
  mounted(el, b) { el._cb = b.value; el._ds = dragSort(el, () => el._cb) },
  updated(el, b) { el._cb = b.value },
  unmounted(el) { el._ds?.() },
}
/** v-drag-sort-day: то же, но задачу можно отпустить над днём полосы недели — она переедет на этот день */
const vDragSortDay: Directive<HTMLElement & { _ds?: () => void; _cb?: (ids: string[]) => void }, (ids: string[]) => void> = {
  mounted(el, b) { el._cb = b.value; el._ds = dragSort(el, () => el._cb, () => dropOnDay) },
  updated(el, b) { el._cb = b.value },
  unmounted(el) { el._ds?.() },
}
/** Задачу отпустили над днём полосы. На более поздний день — это перенос (попадает в историю переносов), на более ранний или из «без даты» — просто новая дата */
async function dropOnDay(id: string, day: string) {
  const t = app.data.tasks.find(x => x.id === id)
  if (!t || t.due_date === day) return
  const ok = t.due_date && day > t.due_date
    ? await app.postponeTask(id, { date: day, time: t.start_time ? hhmm(t.start_time) : '' })
    : await (async () => {
      if (t.recurrence_id && app.data.tasks.some(x => x.id !== id && x.recurrence_id === t.recurrence_id && x.due_date === day)) {
        app.showNotice(`В этот день уже есть «${t.title}» по тому же повтору`); return null
      }
      await app.updateTask(id, { due_date: day, ...(t.status === 'inbox' ? { status: 'planned' as const } : {}) })
      return app.error ? null : day
    })()
  if (ok) app.showNotice(`«${t.title}» → ${shortDate(day)}`)
}

// ---- Привычки другого дня (листая полосу недели, можно смотреть прошлые дни и отмечать их)
const dayHabits = ref<HabitDay[]>([])
const dayHabitList = computed(() => dayHabits.value
  .filter(d => d.scheduled || d.value > 0)
  .flatMap(d => { const h = app.data.habits.find(x => x.id === d.habit_id); return h ? [{ h, d }] : [] }))
let dayReq = 0
async function loadDayHabits() {
  if (!isDay.value || selDay.value === app.today) { dayHabits.value = []; return }
  const req = ++dayReq, day = selDay.value
  const r = await app.habitDays(day, day)
  if (req === dayReq) dayHabits.value = r ?? []
}
watch([mode, selDay], loadDayHabits)
watch(() => app.data.timeEntries, loadDayHabits)   // после правки времени данные перезагружаются
const habitValueText = (h: Habit, d: HabitDay) => (h.kind === 'plain' ? (d.done ? 'сделано' : 'не сделано') : h.kind === 'timer' ? `${d.value} / ${d.target} мин` : `${d.value} / ${d.target}`)
const showLater = ref(false)
const showInactive = ref(false)
/** Отметка привычки без таймера за прошедший день (например, вечерняя таблетка, отмеченная после полуночи) */
async function toggleDayHabit(h: Habit, d: HabitDay) {
  if (await app.bumpHabit(h, d.done ? -1 : 1, selDay.value)) await loadDayHabits()
}

// ---- Строка цикла: «День цикла N» (ведёт в календарь) и «Отметить М»
const cycleLabel = computed(() => { const n = app.cycleNo(app.today); return n ? `${app.cycleSettings.link_label} ${n}` : app.cycleSettings.link_label })
const todayPeriod = computed(() => app.cycleDayOf(app.today).period)
const askStart = ref(false)
async function toggleM() {
  const on = !todayPeriod.value
  if (!(await app.setPeriod(app.today, on))) return
  // вчера отметки не было — возможно, сегодня начался новый цикл
  askStart.value = on && !app.cycleDayOf(addDays(app.today, -1)).period && !app.cycleDayOf(app.today).cycle_start
}
async function confirmStart() { if (await app.markCycleStart(app.today)) askStart.value = false }

/** Форма повтора открывается с тем же, что выбрано в отборе */
const recurrenceDefaults = () => { const f = newTaskFields(); return { sphereId: f.sphere_id ?? undefined, projectId: f.project_id ?? undefined, tags: f.tags } }
const complexity = ref<number | null>(null)
async function add() {
  const title = text.value.trim()
  if (!title) return
  const est = estimate.value, level = complexity.value
  text.value = ''; estimate.value = null; complexity.value = null
  const due = mode.value === 'nodate' ? null : selDay.value
  await app.addTask({ title, status: due ? 'planned' : 'inbox', due_date: due, estimate_minutes: est, complexity: level, ...newTaskFields() })
}
</script>

<template>
  <!-- Шапка: месяц (нажатие открывает месяц целиком), поиск и переключатель «список / сетка часов» -->
  <div class="mb-3 flex items-center justify-between gap-3">
    <button type="button" class="flex items-center gap-1.5 text-2xl font-bold first-letter:uppercase" :aria-expanded="mode === 'month'" data-test="month-toggle" @click="toggleMonth">
      <span class="first-letter:uppercase">{{ monthTitle }}</span>
      <span class="text-base font-normal text-mute">{{ mode === 'month' ? '▴' : '▾' }}</span>
    </button>
    <div class="flex items-center gap-1">
      <button type="button" class="grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-accent-soft hover:text-accent" aria-label="Поиск задач" title="Поиск по задачам и тегам" data-test="open-search" @click="app.openSearch()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      </button>
      <button v-if="mode !== 'month'" type="button" class="grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-accent-soft hover:text-accent"
        :class="dayMode === 'grid' && '!bg-accent-soft !text-accent'" :aria-pressed="dayMode === 'grid'" :title="dayMode === 'grid' ? 'Показать списком' : 'Показать по часам'" data-test="grid-toggle" @click="setDayMode(dayMode === 'grid' ? 'list' : 'grid')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16M4 15h16M9 4v16" /></svg>
      </button>
      <SettingsLink />
    </div>
  </div>

  <!-- Полоса недели: главная навигация по дням -->
  <div v-if="mode !== 'month'" class="glass sticky top-[var(--timer-h,0px)] z-10 -mx-2 mb-3 flex items-center gap-0.5 rounded-2xl px-1 py-1" data-test="week-strip">
    <button type="button" class="shrink-0 rounded-full px-1.5 py-3 text-mute hover:text-accent" aria-label="Предыдущая неделя" @click="selDay = addDays(selDay, -7)">‹</button>
    <button v-for="d in weekDays" :key="d" type="button" class="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 transition"
      :class="d === selDay && isDay ? 'bg-accent-soft text-accent-deep ring-1 ring-accent/30' : d === app.today ? 'text-accent' : 'text-ink/80 hover:bg-accent-soft'"
      :aria-pressed="d === selDay && isDay" :aria-label="longDate(d) + (d === app.today ? ', сегодня' : '') + (app.overloadOn(d).length ? ', день перегружен' : '')" :data-day="d" @click="pickStripDay(d)">
      <span class="text-[11px] leading-none" :class="d === selDay && isDay ? 'text-accent-deep/70' : 'text-mute'">{{ wdOf(d) }}</span>
      <span class="text-base font-semibold leading-tight" :class="d === app.today && 'underline decoration-2 underline-offset-4'">{{ Number(d.slice(8)) }}</span>
      <span class="flex h-1.5 gap-0.5">
        <span v-if="hasPending(d)" class="h-1.5 w-1.5 rounded-full" :class="d === selDay && isDay ? 'bg-accent/70' : 'bg-accent/50'"></span>
        <span v-if="app.overloadOn(d).length" class="h-1.5 w-1.5 rounded-full bg-amber-500" data-test="overload-mark"></span>
      </span>
    </button>
    <button type="button" class="shrink-0 rounded-full px-1.5 py-3 text-mute hover:text-accent" aria-label="Следующая неделя" @click="selDay = addDays(selDay, 7)">›</button>
  </div>

  <!-- Что показывать: всё / задачи / привычки; «Без даты» — отдельный список -->
  <div v-if="mode !== 'month'" class="mb-3 flex flex-wrap items-center gap-2">
    <div v-if="isDay" class="flex rounded-xl border border-line bg-white/70 p-0.5 text-sm font-medium" role="group" aria-label="Что показывать" data-test="show-switch">
      <button v-for="s in shows" :key="s.v" type="button" class="rounded-lg px-3 py-1.5" :class="show === s.v ? 'bg-white text-accent-deep shadow-[0_1px_4px_rgba(63,56,114,0.15)]' : 'text-mute'" :aria-pressed="show === s.v" @click="show = s.v">{{ s.label }}</button>
    </div>
    <button type="button" class="chip ml-auto py-1.5 text-sm" :class="mode === 'nodate' && 'chip-on'" :aria-pressed="mode === 'nodate'" data-test="nodate-toggle" @click="mode = mode === 'nodate' ? dayMode : 'nodate'">Без даты</button>
  </div>

  <div v-if="app.modOn('cycle') && isDay && selDay === app.today && show !== 'tasks'" class="mb-3 flex flex-wrap items-center gap-2" data-test="cycle-line">
    <RouterLink to="/today/cycle" class="chip py-1.5 text-sm" data-test="cycle-link">{{ cycleLabel }}</RouterLink>
    <button v-if="app.showCycle" type="button" class="chip py-1.5 text-sm" :class="todayPeriod && 'chip-on'" data-test="mark-m" @click="toggleM">{{ todayPeriod ? '✓ М' : 'Отметить М' }}</button>
    <span v-if="askStart" class="flex items-center gap-2 text-sm" data-test="ask-start">
      Первый день цикла?
      <button type="button" class="chip py-1 text-sm hover:chip-on" data-test="ask-start-yes" @click="confirmStart">Да</button>
      <button type="button" class="chip py-1 text-sm" @click="askStart = false">Нет</button>
    </span>
  </div>
  <PillCheck v-if="app.showCycle && isDay && selDay === app.today && show !== 'tasks'" />

  <RouterLink v-if="isSunday && !reviewDone" to="/review" class="card mb-4 flex items-center gap-3 border-accent bg-accent-soft p-4">
    <span class="flex-1"><span class="block font-semibold text-accent">Воскресенье — время подвести итог недели</span><span class="text-sm text-mute">Посмотри цифры, ответь на три вопроса и поставь цели на следующую неделю</span></span>
    <span class="text-accent">›</span>
  </RouterLink>

  <!-- Сводка дня: одна строка; если день перегружен, времени не хватает или есть просрочка — янтарная и раскрыта -->
  <section v-if="hasSummary" class="mb-3 rounded-xl px-3 py-2 text-sm" :class="alert ? 'bg-amber-50 text-amber-900' : 'bg-accent-soft'" data-test="day-summary">
    <button type="button" class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-left" :aria-expanded="sumOpen" data-test="day-summary-toggle" @click="sumOpenManual = !sumOpen">
      <span v-if="alert" class="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true"></span>
      <span v-if="plannedMin > 0 || freeMin != null"><span :class="overTime && 'font-semibold'">≈ {{ hrs(plannedMin) }}</span><template v-if="freeMin != null"> из {{ hrs(freeMin) }}</template></span>
      <span v-if="hasBudget" :class="!alert && 'text-accent'" class="font-semibold">· {{ fmtMoney(budget!.total) }}</span>
      <span v-if="overload.length" class="font-semibold">· перегружен</span>
      <span v-if="todayOverdue" class="font-semibold">· просрочено {{ todayOverdue }}</span>
      <span class="ml-auto text-xs" :class="alert ? 'text-amber-800' : 'text-mute'">{{ sumOpen ? '▴' : '▾' }}</span>
    </button>
    <ul v-if="sumOpen" class="mt-1.5 space-y-0.5 text-xs" :class="alert ? 'text-amber-900' : 'text-mute'" data-test="day-summary-details">
      <li v-if="freeMin != null">Запланировано {{ hrs(plannedMin) }} (задачи с оценкой и привычки с таймером), свободно до конца дня {{ hrs(freeMin) }}<template v-if="overTime"> — не хватает {{ hrs(plannedMin - freeMin) }}</template>.</li>
      <li v-else-if="plannedMin > 0">По оценкам задач: {{ hrs(plannedMin) }}.</li>
      <li v-if="overload.length" data-test="day-overload">День перегружен: {{ overload.map(o => `${o.many} ${o.count} из ${o.limit}`).join(', ') }}.</li>
      <li v-if="todayOverdue">Просрочено задач: {{ todayOverdue }} — они вверху списка.</li>
      <li v-if="hasBudget" data-test="budget-sum">Бюджет {{ budgetPeriod.label }}: {{ fmtMoney(budget!.total) }}<template v-if="budget!.left !== budget!.total">, осталось {{ fmtMoney(budget!.left) }}</template><template v-if="budget!.virtual">, из них по повторам {{ fmtMoney(budget!.virtual) }}</template><template v-if="budget!.overdue">, ещё просрочено {{ fmtMoney(budget!.overdue) }}</template>.</li>
    </ul>
  </section>

  <!-- Привычки на сегодня -->
  <section v-if="isDay && selDay === app.today && show !== 'tasks'" class="mb-6">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-mute">Привычки</h2>
      <button class="text-sm font-semibold text-accent" @click="showHabitForm = !showHabitForm">{{ showHabitForm ? 'Закрыть' : '+ Привычка' }}</button>
    </div>
    <HabitForm v-if="showHabitForm" class="mb-3" @done="showHabitForm = false" />
    <template v-if="habits.length">
      <div class="card divide-y divide-line" data-test="habit-list" v-drag-sort="onHabitSort">
        <div v-for="h in visibleHabits" :key="h.id" :data-id="h.id"><HabitRow :habit="h" sortable /></div>
      </div>
      <div v-if="restHabits.length" class="mt-2">
        <button type="button" class="text-xs font-semibold text-mute" data-test="habit-rest-toggle" :aria-expanded="showRest" @click="showRest = !showRest">Ещё привычки ({{ restLabel }}) {{ showRest ? '▴' : '▾' }}</button>
        <div v-if="showRest" class="card mt-1.5 divide-y divide-line" data-test="habit-rest">
          <HabitRow v-for="h in restHabits" :key="h.id" :habit="h" />
        </div>
      </div>
    </template>
    <p v-else-if="!showHabitForm && !app.laterHabits.length && !app.inactiveHabits.length" class="text-sm text-mute">Привычек пока нет.</p>
    <p v-else-if="!showHabitForm" class="text-sm text-mute">На сегодня привычек нет.</p>
    <div v-if="app.laterHabits.length" class="mt-2">
      <button type="button" class="text-xs font-semibold text-mute" :aria-expanded="showLater" @click="showLater = !showLater">Не сегодня ({{ app.laterHabits.length }}) {{ showLater ? '▴' : '▾' }}</button>
      <div v-if="showLater" class="card mt-1.5 divide-y divide-line" data-test="later-habits">
        <HabitRow v-for="h in app.laterHabits" :key="h.id" :habit="h" />
      </div>
    </div>
    <div v-if="app.inactiveHabits.length" class="mt-2">
      <button type="button" class="text-xs font-semibold text-mute" :aria-expanded="showInactive" data-test="inactive-toggle" @click="showInactive = !showInactive">Сейчас не активны ({{ app.inactiveHabits.length }}) {{ showInactive ? '▴' : '▾' }}</button>
      <div v-if="showInactive" class="card mt-1.5 divide-y divide-line" data-test="inactive-habits">
        <HabitRow v-for="h in app.inactiveHabits" :key="h.id" :habit="h" />
      </div>
    </div>
  </section>

  <!-- Привычки другого дня: прошедшие можно отметить -->
  <section v-if="isDay && selDay !== app.today && show !== 'tasks' && dayHabitList.length" class="mb-4" data-test="day-habits">
    <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-mute">Привычки за день</div>
    <div class="card divide-y divide-line">
      <div v-for="x in dayHabitList" :key="x.h.id" class="flex items-center gap-3 px-3 py-2.5" data-test="day-habit">
        <button v-if="x.h.kind === 'plain' && selDay < app.today" type="button" class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition"
          :class="x.d.done ? 'border-success bg-success text-white' : 'border-line hover:border-accent'" :aria-label="(x.d.done ? 'Снять отметку: ' : 'Отметить: ') + x.h.name"
          data-test="day-habit-toggle" @click="toggleDayHabit(x.h, x.d)">{{ x.d.done ? '✓' : '' }}</button>
        <span v-else class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold" :class="x.d.done ? 'bg-success text-white' : 'bg-accent-soft text-accent'"><template v-if="x.d.done">✓</template><Icon v-else-if="x.h.kind === 'timer'" name="timer" :size="13" /><template v-else>#</template></span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-[15px]">{{ x.h.name }}</div>
          <div class="text-xs text-mute"><span v-if="app.sphereById(x.h.sphere_id)" class="mr-1.5 inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full" :style="{ background: app.sphereById(x.h.sphere_id)?.color }"></span>{{ app.sphereById(x.h.sphere_id)?.name }}</span>{{ habitValueText(x.h, x.d) }}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Список задач дня или задач без даты -->
  <template v-if="(mode === 'list' && show !== 'habits') || mode === 'nodate'">
    <h2 v-if="mode === 'nodate'" class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Без даты</h2>
    <div v-if="mode === 'nodate' && hasBudget" class="mb-3 rounded-xl bg-accent-soft px-3 py-2 text-sm" data-test="budget-sum">
      <span class="text-mute">Бюджет без даты:</span> <span class="font-semibold text-accent">{{ fmtMoney(budget!.total) }}</span>
      <span v-if="budget!.left !== budget!.total" class="text-xs text-mute"> · осталось {{ fmtMoney(budget!.left) }}</span>
    </div>
    <form class="mb-3 flex flex-wrap items-start gap-2" @submit.prevent="add">
      <AutoTextarea v-model="text" single-line :maxlength="500" class="!w-auto min-w-[10rem] flex-1" :placeholder="mode === 'nodate' ? 'Новое дело без даты…' : selDay === app.today ? 'Новое дело…' : 'Новое дело на ' + shortDate(selDay) + '…'" @submit="add" />
      <EstimateInput v-model="estimate" />
      <ComplexityPicker v-model="complexity" />
      <button class="btn-soft shrink-0" :disabled="!text.trim()" aria-label="Добавить задачу">+</button>
      <button type="button" class="btn-ghost shrink-0" title="Повторяющаяся задача" aria-label="Повторяющаяся задача" @click="showRecForm = !showRecForm"><Icon name="repeat" :size="16" /></button>
      <!-- Отбор по сфере / проекту, за ним 🏷 — одной строкой; если места нет, теги переносятся ниже -->
      <div class="flex w-full flex-wrap items-start gap-2">
        <TaskFilter v-model="taskFilter" class="!mb-0 min-w-0" />
        <QuickTags v-model="text" large class="!w-auto min-w-0 max-w-full" />
      </div>
    </form>
    <TagBar v-model="taskFilter.tags" :scope="taskFilter" />
    <RecurrenceForm v-if="showRecForm" class="mb-3" v-bind="recurrenceDefaults()" @done="showRecForm = false" />
    <div v-if="list.length" v-drag-sort-day="onTaskSort" class="card divide-y divide-line" data-test="task-list">
      <div v-for="t in list" :key="t.id" :data-id="t.id">
        <TaskRow :task="t" sortable>
          <span v-if="t.due_date && t.due_date < selDay" class="shrink-0 text-xs text-amber-700">{{ shortDate(t.due_date) }}</span>
          <RouterLink v-else-if="t.status === 'inbox'" to="/inbox" class="shrink-0 text-xs text-mute hover:text-accent" title="Задача ещё не разобрана — лежит во «Входящих»" data-test="from-inbox">во входящих</RouterLink>
        </TaskRow>
      </div>
    </div>
    <div v-else class="card p-8 text-center text-mute">Здесь пока ничего нет</div>

    <DoneBlock :tasks="doneList" />
  </template>

  <!-- Месяц и сетка часов: отбор по сфере / проекту и теги — над ними -->
  <template v-if="mode === 'month' || (mode === 'grid' && show !== 'habits')">
    <TaskFilter v-model="taskFilter" />
    <TagBar v-model="taskFilter.tags" :scope="taskFilter" />
  </template>

  <template v-if="mode === 'month'">
    <div v-if="hasBudget" class="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl bg-accent-soft px-3 py-2 text-sm" data-test="budget-sum">
      <span class="text-mute">Бюджет {{ budgetPeriod.label }}:</span>
      <span class="font-semibold text-accent">{{ fmtMoney(budget!.total) }}</span>
      <span v-if="budget!.left !== budget!.total" class="text-xs text-mute">осталось {{ fmtMoney(budget!.left) }}</span>
      <span v-if="budget!.overdue" class="text-xs text-amber-700">· ещё просрочено {{ fmtMoney(budget!.overdue) }}</span>
    </div>
  <!-- Месяц: кружки по сферам, нажатие на день открывает его часовую сетку -->
    <MonthGrid ref="monthGrid" v-model="calMonth" :today="app.today" data-test="task-month">
      <template #day="{ d, inMonth }">
        <button type="button" :data-day="d"
          class="flex min-h-[4rem] flex-col items-center gap-0.5 rounded-xl px-0.5 pb-1 pt-1 text-sm transition hover:ring-2 hover:ring-accent/40"
          :class="[!inMonth && d !== monthSel && 'opacity-35', d === app.today ? 'bg-accent-soft font-bold text-accent' : 'bg-white/70', d === monthSel && 'ring-2 ring-accent']"
          :aria-pressed="d === monthSel" :aria-label="longDate(d) + (summary.get(d)?.label ? ': ' + summary.get(d)!.label : '') + (app.overloadOn(d).length ? ', день перегружен' : '')" @click="pickDay(d)">
          <span class="leading-none">{{ Number(d.slice(8)) }}</span>
          <span class="flex flex-wrap justify-center gap-0.5">
            <span v-for="m in (summary.get(d)?.marks ?? []).slice(0, MAX_MARKS)" :key="m.key" :data-kind="m.kind"
              class="grid h-[18px] min-w-[18px] place-items-center rounded-full border-[1.5px] bg-white px-[3px] text-[10px] font-semibold leading-none"
              :class="[m.kind === 'done' && 'opacity-40', m.kind === 'virtual' && 'border-dashed']"
              :style="{ borderColor: m.color, color: m.color }" data-test="day-mark">{{ m.count }}</span>
            <span v-if="(summary.get(d)?.marks.length ?? 0) > MAX_MARKS" class="text-[10px] font-semibold leading-[18px] text-mute">+{{ summary.get(d)!.marks.length - MAX_MARKS }}</span>
          </span>
          <span v-if="(summary.get(d)?.minutes ?? 0) >= 30" class="text-[9px] font-normal leading-none text-mute" data-test="day-load">≈{{ fmtLoad(summary.get(d)!.minutes) }}</span>
          <span v-if="app.overloadOn(d).length" class="h-1.5 w-1.5 rounded-full bg-amber-500" title="День перегружен" data-test="overload-mark"></span>
        </button>
      </template>
    </MonthGrid>
    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
      <span class="inline-flex items-center gap-1"><span class="grid h-4 min-w-4 place-items-center rounded-full border-[1.5px] border-accent px-1 text-[9px] font-semibold text-accent">2</span>дела по сфере</span>
      <span class="inline-flex items-center gap-1"><span class="grid h-4 min-w-4 place-items-center rounded-full border-[1.5px] border-accent px-1 text-[9px] font-semibold text-accent opacity-40">2</span>выполнено</span>
      <span class="inline-flex items-center gap-1"><span class="grid h-4 min-w-4 place-items-center rounded-full border-[1.5px] px-1 text-[9px] font-semibold" :style="{ borderColor: OVERDUE_COLOR, color: OVERDUE_COLOR }">1</span>просрочено</span>
      <span class="inline-flex items-center gap-1"><span class="grid h-4 min-w-4 place-items-center rounded-full border-[1.5px] border-dashed border-accent px-1 text-[9px] font-semibold text-accent">1</span>повтор (ещё не создан)</span>
      <span>≈ ч — по оценкам времени</span>
      <span class="inline-flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>день перегружен</span>
    </div>

    <!-- Задачи выбранного дня: за ⋮⋮ их можно перетащить на другой день (подержать над ‹ › — листается месяц) -->
    <section class="mt-4" data-test="month-day">
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold first-letter:uppercase">{{ longDate(monthSel) }}</h2>
        <button type="button" class="text-sm font-semibold text-accent" data-test="month-open-day" @click="openDay(monthSel)">Открыть день ›</button>
      </div>
      <p v-if="moveMsg" class="mb-1.5 text-xs text-accent" data-test="move-msg">{{ moveMsg }}</p>
      <DayOverload :day="monthSel" />
      <DayTaskForm :day="monthSel" :new-task-fields="newTaskFields" />
      <div v-if="selTasks.length" v-drag-to-day class="card divide-y divide-line" data-test="month-day-tasks">
        <div v-for="t in selTasks" :key="t.id" :data-task-id="t.id" class="flex items-center">
          <span data-drag-handle class="shrink-0 cursor-grab touch-none select-none py-3 pl-2 text-base leading-none text-mute/70 hover:text-accent" role="button"
            aria-label="Перетащить задачу на другой день" title="Перетащи на другой день календаря">⋮⋮</span>
          <TaskRow :task="t" class="min-w-0 flex-1"><span v-if="t.start_time" class="shrink-0 text-xs text-mute">{{ timeRange(t) }}</span></TaskRow>
        </div>
      </div>
      <p v-else-if="!selVirtual.length" class="text-sm text-mute">На этот день задач нет.</p>
      <ul v-if="selVirtual.length" class="mt-1.5 space-y-1 text-sm text-mute" data-test="month-day-virtual">
        <li v-for="r in selVirtual" :key="r.id"><Icon name="repeat" :size="12" /> {{ r.title }} <span class="text-xs">— по повтору, задача появится ближе к дате</span></li>
      </ul>
      <p v-if="selTasks.length" class="mt-1.5 text-xs text-mute">Перетащи задачу за ⋮⋮ на другой день. Чтобы перейти в другой месяц, подержи её над стрелкой ‹ или ›.</p>
    </section>

  </template>

  <!-- Сетка часов выбранного дня: сверху задачи без времени -->
  <template v-if="mode === 'grid' && show !== 'habits'">
    <DayTaskForm :day="selDay" :new-task-fields="newTaskFields" />
    <div v-if="untimedOnDay.length" class="mb-3">
      <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-mute">Без времени</div>
      <div v-drag-sort-day="onTaskSort" class="card divide-y divide-line">
        <TaskRow v-for="t in untimedOnDay" :key="t.id" :data-id="t.id" :task="t" sortable />
      </div>
    </div>
    <!-- Сетка дня: строка на час; блоки от часа занимают несколько строк, пересекающиеся стоят рядом колонками.
         В узком блоке (рядом есть другие) строка задачи упрощена, кнопки таймера и переноса — в карточке задачи.
         На телефоне диапазон времени скрыт: время и план уже есть под названием -->
    <div class="card grid overflow-hidden" data-test="day-grid"
      :style="{ gridTemplateColumns: `3.5rem repeat(${dayLayout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${hours.length}, minmax(3.25rem, auto))` }">
      <template v-for="(h, i) in hours" :key="h">
        <div class="border-line" :class="{ 'border-t': i > 0 }" :style="{ gridRow: i + 1, gridColumn: '1 / -1' }"></div>
        <div class="border-r border-line px-2 py-2 text-xs text-mute" :class="{ 'border-t': i > 0 }" :style="{ gridRow: i + 1, gridColumn: 1 }">{{ String(h).padStart(2, '0') }}:00</div>
      </template>
      <div v-for="c in dayLayout.shorts" :key="'h' + c.hour" class="z-10 grid min-w-0 auto-rows-fr grid-cols-[minmax(0,1fr)] gap-1 p-1" data-test="day-short"
        :style="{ gridRow: c.hour - hours[0] + 1, gridColumn: `${c.col + 2} / span ${c.span}` }">
        <div v-for="t in c.tasks" :key="t.id" class="flex min-w-0 flex-col overflow-hidden rounded-xl border-l-4 bg-accent-soft" :style="blockColor(t)" :data-task="t.id">
          <TaskRow :task="t" class="min-w-0 flex-1" wrap-title :dense="c.span < dayLayout.columns"><span v-if="c.span === dayLayout.columns" class="hidden shrink-0 text-xs text-mute sm:inline">{{ timeRange(t) }}</span></TaskRow>
        </div>
      </div>
      <div v-for="l in dayLayout.longs" :key="l.task.id" class="z-10 flex min-w-0 p-1" data-test="day-long"
        :style="{ gridRow: `${l.from - hours[0] + 1} / span ${l.to - l.from + 1}`, gridColumn: `${l.col + 2} / span ${l.span}` }">
        <div class="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border-l-4 bg-accent-soft" :style="blockColor(l.task)" :data-task="l.task.id">
          <TaskRow :task="l.task" class="min-w-0 flex-1" wrap-title :dense="l.span < dayLayout.columns"><span v-if="l.span === dayLayout.columns" class="hidden shrink-0 text-xs text-mute sm:inline">{{ timeRange(l.task) }}</span></TaskRow>
        </div>
      </div>
    </div>
  </template>
</template>
