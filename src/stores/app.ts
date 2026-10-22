import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repo } from '../data'
import type { PushSub, ExportData, ReviewInput, WeekData, WeeklyReview, EditorTarget, Habit, HabitEntry, NewHabit, NewRecurrence, NewTask, Snapshot, Sphere, Task, TimeEntry, User } from '../types'
import { addDays, dayOf, entrySeconds, monthStart, todayStr, weekStart } from '../lib/time'

export const NUDGE_MINUTES = 40
export const FORGOTTEN_MINUTES = 180

export const useApp = defineStore('app', () => {
  const user = ref<User | null>(null)
  const ready = ref(false)
  const loading = ref(false)
  const error = ref('')
  const data = ref<Snapshot>({ spheres: [], tasks: [], habits: [], recurrences: [], weekGoals: [], reviews: [], habitEntries: [], timeEntries: [] })
  const now = ref(Date.now())
  const today = ref(todayStr())
  let tick: number | undefined
  /** Открытое окно правки времени */
  /** Открытая карточка задачи */
  const detailId = ref<string | null>(null)
  const openTask = (id: string) => { detailId.value = id }
  const closeTask = () => { detailId.value = null }
  const editor = ref<{ target: EditorTarget; title: string } | null>(null)

  const spheres = computed(() => data.value.spheres)
  const inbox = computed(() => data.value.tasks.filter(t => t.status === 'inbox'))
  const sphereById = (id: string | null) => data.value.spheres.find(s => s.id === id) ?? null
  const running = computed<TimeEntry | null>(() => data.value.timeEntries.find(e => !e.ended_at) ?? null)
  const runningSeconds = computed(() => (running.value ? entrySeconds(running.value, now.value) : 0))
  /** раз в 40 минут просим проверить, идёт ли ещё дело; через 3 часа считаем таймер забытым */
  const nudgeActive = computed(() => {
    const m = runningSeconds.value / 60
    return m >= NUDGE_MINUTES
  })
  const forgotten = computed(() => runningSeconds.value / 60 >= FORGOTTEN_MINUTES)
  const runningTitle = computed(() => {
    const r = running.value
    if (!r) return ''
    if (r.task_id) return data.value.tasks.find(t => t.id === r.task_id)?.title ?? 'Задача'
    if (r.habit_id) return data.value.habits.find(h => h.id === r.habit_id)?.name ?? 'Привычка'
    return sphereById(r.sphere_id)?.name ?? 'Без названия'
  })

  /** минуты по сферам с даты from (включая идущий таймер) */
  function sphereMinutesSince(from: string) {
    const res: Record<string, number> = {}
    for (const e of data.value.timeEntries) {
      if (!e.sphere_id || dayOf(e.started_at) < from) continue
      res[e.sphere_id] = (res[e.sphere_id] ?? 0) + entrySeconds(e, now.value) / 60
    }
    return res
  }
  const weekMinutes = computed(() => sphereMinutesSince(weekStart(today.value)))
  const monthMinutes = computed(() => sphereMinutesSince(monthStart(today.value)))
  /** секунды по задачам: за неделю и за месяц (живое время идущего таймера учитывается) */
  const taskTotals = computed(() => {
    const w = weekStart(today.value), m = monthStart(today.value)
    const res: Record<string, { week: number; month: number }> = {}
    for (const e of data.value.timeEntries) {
      if (!e.task_id) continue
      const d = dayOf(e.started_at), sec = entrySeconds(e, now.value)
      const r = (res[e.task_id] ??= { week: 0, month: 0 })
      if (d >= w) r.week += sec
      if (d >= m) r.month += sec
    }
    return res
  })
  /** Цель сферы на неделю: цель именно этой недели или значение по умолчанию */
  function goalFor(sphereId: string, week: string = weekStart(today.value)): number {
    const g = data.value.weekGoals.find(x => x.sphere_id === sphereId && x.week_start === week)
    return g ? g.minutes : (data.value.spheres.find(s => s.id === sphereId)?.weekly_goal_minutes ?? 0)
  }
  const reviewFor = (week: string): WeeklyReview | undefined => data.value.reviews.find(r => r.week_start === week)
  const currentReview = computed(() => reviewFor(weekStart(today.value)))
  const habitValue = (id: string) => data.value.habitEntries.find(e => e.habit_id === id && e.entry_date === today.value)?.value ?? 0

  function startClock() {
    stopClock()
    tick = window.setInterval(() => {
      now.value = Date.now()
      const t = todayStr()
      if (t !== today.value) { today.value = t; void load() } // наступила полночь — новый день
    }, 1000)
  }
  function stopClock() { if (tick) window.clearInterval(tick); tick = undefined }

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try { error.value = ''; return await fn() } catch (e) { error.value = (e as Error).message; return undefined }
  }

  async function init() {
    user.value = await guard(() => repo.session()) ?? null
    if (user.value) { await load(); startClock() }
    ready.value = true
  }
  async function load() {
    loading.value = true
    await guard(async () => { data.value = await repo.load(today.value, [weekStart(today.value), monthStart(today.value)].sort()[0]) })
    loading.value = false
  }
  async function signIn(email: string, password: string) {
    const u = await guard(() => repo.signIn(email, password))
    if (u) { user.value = u; await load(); startClock() }
    return !!u
  }
  async function signUp(email: string, password: string): Promise<'ok' | 'confirm' | 'fail'> {
    let res: 'ok' | 'confirm' | 'fail' = 'fail'
    await guard(async () => {
      const u = await repo.signUp(email, password)
      if (u) { user.value = u; await load(); startClock(); res = 'ok' } else res = 'confirm'
    })
    return res
  }
  async function signOut() {
    stopClock(); await guard(() => repo.signOut()); user.value = null
    data.value = { spheres: [], tasks: [], habits: [], recurrences: [], weekGoals: [], reviews: [], habitEntries: [], timeEntries: [] }
  }

  async function addTask(t: NewTask) {
    const task = await guard(() => repo.addTask(t)); if (task) data.value.tasks.unshift(task)
  }
  async function updateTask(id: string, patch: Partial<NewTask>) {
    const task = await guard(() => repo.updateTask(id, patch))
    if (task) {
      const i = data.value.tasks.findIndex(t => t.id === id)
      if (i >= 0) data.value.tasks[i] = task
      // выполнили повторяющуюся задачу — следующая могла создаться (режим «после выполнения»)
      if (patch.status === 'done' && task.recurrence_id) await load()
    }
  }
  async function toggleDone(t: Task) {
    await updateTask(t.id, { status: t.status === 'done' ? (t.due_date ? 'planned' : 'inbox') : 'done' })
  }
  async function removeTask(id: string) {
    await guard(() => repo.removeTask(id)); data.value.tasks = data.value.tasks.filter(t => t.id !== id)
  }
  async function addSphere(name: string, color: string, goal: number) {
    const s = await guard(() => repo.addSphere(name, color, goal)); if (s) data.value.spheres.push(s as Sphere)
  }
  async function addHabit(h: NewHabit) {
    const x = await guard(() => repo.addHabit(h)); if (x) data.value.habits.push(x as Habit)
  }
  async function startTimer(target: { task_id?: string; habit_id?: string; sphere_id?: string }) {
    const e = await guard(() => repo.startTimer(target))
    if (e) {
      const prev = running.value
      if (prev) prev.ended_at = new Date().toISOString()
      data.value.timeEntries.push(e)
    }
  }
  async function stopTimer() {
    const e = await guard(() => repo.stopTimer())
    if (e) { const i = data.value.timeEntries.findIndex(x => x.id === e.id); if (i >= 0) data.value.timeEntries[i] = e }
  }
  async function addRecurrence(r: NewRecurrence) {
    const ok = await guard(async () => { await repo.addRecurrence(r); return true })
    if (ok) await load()
    return !!ok
  }
  async function removeRecurrence(id: string) {
    await guard(() => repo.removeRecurrence(id)); await load()
  }
  const openEditor = (target: EditorTarget, title: string) => { editor.value = { target, title } }
  const closeEditor = () => { editor.value = null }
  /** Изменение записей времени: после любой правки перезагружаем суммы */
  async function timeOp(fn: () => Promise<void>) {
    const ok = await guard(async () => { await fn(); return true })
    if (ok) await load()
    return !!ok
  }
  const addEntry = (t: EditorTarget, a: string, b: string) => timeOp(() => repo.addEntry(t, a, b))
  const updateEntry = (id: string, a: string, b: string) => timeOp(() => repo.updateEntry(id, a, b))
  const removeEntry = (id: string) => timeOp(() => repo.removeEntry(id))
  const listEntries = (t: EditorTarget) => guard(() => repo.listEntries(t)) as Promise<TimeEntry[] | undefined>

  async function setWeekGoal(sphereId: string, week: string, minutes: number, makeDefault: boolean) {
    const ok = await guard(async () => { await repo.setWeekGoal(sphereId, week, Math.max(0, Math.round(minutes)), makeDefault); return true })
    if (ok) await load()
    return !!ok
  }
  const weekData = (week: string) => guard(() => repo.weekData(week)) as Promise<WeekData | undefined>
  async function saveReview(week: string, input: ReviewInput, snapshot: WeekData | null, complete: boolean) {
    const ok = await guard(async () => { await repo.saveReview(week, input, snapshot, complete); return true })
    if (ok) await load()
    return !!ok
  }
  const savePush = (sub: PushSub) => guard(async () => { await repo.savePushSubscription(sub); return true }) as Promise<boolean | undefined>
  const removePush = (endpoint: string) => guard(async () => { await repo.removePushSubscription(endpoint); return true }) as Promise<boolean | undefined>
  const exportAll = () => guard(() => repo.exportAll()) as Promise<ExportData | undefined>

  async function bumpHabit(h: Habit, delta: number) {
    const e = await guard(() => repo.bumpHabit(h.id, delta, today.value)) as HabitEntry | undefined
    if (!e) return
    const list = data.value.habitEntries
    const i = list.findIndex(x => x.habit_id === h.id && x.entry_date === today.value)
    if (i >= 0) list[i] = { ...list[i], value: e.value }; else list.push({ habit_id: h.id, entry_date: today.value, value: e.value })
  }

  return {
    user, ready, loading, error, data, now, today, spheres, inbox, running, runningSeconds, runningTitle,
    nudgeActive, forgotten, weekMinutes, monthMinutes, taskTotals, sphereById, habitValue, addDays,
    init, load, signIn, signUp, signOut, addTask, updateTask, toggleDone, removeTask, addSphere, addHabit,
    goalFor, reviewFor, currentReview, setWeekGoal, weekData, saveReview, exportAll, savePush, removePush,
    startTimer, stopTimer, bumpHabit, addRecurrence, removeRecurrence,
    detailId, openTask, closeTask, editor, openEditor, closeEditor, addEntry, updateEntry, removeEntry, listEntries,
  }
})
