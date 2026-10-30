import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repo } from '../data'
import type { TimeBudget, RecurrencePatch, SpherePlan, GoogleSettingsPatch, GoogleStatus, Project, PushSub, ExportData, ReviewInput, WeekData, WeeklyReview, EditorTarget, Habit, HabitDay, HabitEntry, HabitStatus, NewHabit, NewRecurrence, NewTask, Snapshot, Sphere, SpherePatch, Task, TimeEntry, User } from '../types'
import { googleClientId } from '../lib/google'
import { addDays, dayOf, entrySeconds, monthStart, todayStr, weekStart } from '../lib/time'

export const NUDGE_MINUTES = 40
export const FORGOTTEN_MINUTES = 180

export const useApp = defineStore('app', () => {
  const user = ref<User | null>(null)
  const ready = ref(false)
  const loading = ref(false)
  const error = ref('')
  const data = ref<Snapshot>({ spheres: [], projects: [], tasks: [], habits: [], recurrences: [], weekGoals: [], reviews: [], habitEntries: [], timeEntries: [] })
  const now = ref(Date.now())
  const today = ref(todayStr())
  let tick: number | undefined
  /** Открытое окно правки времени */
  /** Открытая карточка задачи */
  const habitDetailId = ref<string | null>(null)
  const openHabit = (id: string) => { habitDetailId.value = id }
  const closeHabit = () => { habitDetailId.value = null }
  const detailId = ref<string | null>(null)
  const openTask = (id: string) => { detailId.value = id }
  const closeTask = () => { detailId.value = null }
  const editor = ref<{ target: EditorTarget; title: string; day?: string } | null>(null)
  /** Только что остановленный очень долгий таймер (забытый на ночь): предлагаем сразу исправить время */
  const longStop = ref<{ id: string; title: string; started_at: string; seconds: number } | null>(null)

  const spheres = computed(() => data.value.spheres)
  const inbox = computed(() => data.value.tasks.filter(t => t.status === 'inbox'))
  const archivedSpheres = computed(() => data.value.archivedSpheres ?? [])
  const sphereById = (id: string | null) => data.value.spheres.find(s => s.id === id) ?? null
  const projectById = (id: string | null | undefined) => data.value.projects.find(p => p.id === id) ?? null
  /** Проекты сферы */
  const projectsOf = (sphereId: string | null) => data.value.projects.filter(p => p.sphere_id === sphereId && p.status !== 'archived')
  const archivedProjectsOf = (sphereId: string | null) => data.value.projects.filter(p => p.sphere_id === sphereId && p.status === 'archived')
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
  /** Состояние привычки на сегодня. Если база его не прислала — считаем запланированной */
  const habitStatusOf = (id: string): HabitStatus => data.value.habitStatus?.find(s => s.habit_id === id) ?? { habit_id: id, scheduled: true, due: null, last_done: null }
  const dueHabits = computed(() => data.value.habits.filter(h => habitStatusOf(h.id).scheduled))
  const laterHabits = computed(() => data.value.habits.filter(h => !habitStatusOf(h.id).scheduled))
  /** Выполнена ли привычка сегодня (для таймера — по минутам сегодняшних записей) */
  const habitIsDone = (h: Habit) => {
    const target = h.target_value ?? 1
    if (h.kind !== 'timer') return (data.value.habitEntries.find(e => e.habit_id === h.id && e.entry_date === today.value)?.value ?? 0) >= target
    let sec = 0
    for (const e of data.value.timeEntries) if (e.habit_id === h.id && dayOf(e.started_at) === today.value) sec += entrySeconds(e, now.value)
    return Math.floor(sec / 60) >= target
  }
  /** Новый порядок привычек. ids — привычки, показанные в новом порядке (могут быть не все): остальные остаются на своих местах */
  async function reorderHabits(ids: string[]) {
    const all = data.value.habits.map(h => h.id)
    const slots = all.map((id, i) => [id, i] as const).filter(([id]) => ids.includes(id)).map(([, i]) => i)
    const next = [...all]
    slots.forEach((slot, k) => { next[slot] = ids[k] })
    const before = data.value.habits
    const byId = new Map(before.map(h => [h.id, h]))
    data.value.habits = next.map(id => byId.get(id)!)
    const ok = await guard(async () => { await repo.reorderHabits(next); return true })
    if (!ok) data.value.habits = before
    return !!ok
  }
  const habitValue = (id: string) => data.value.habitEntries.find(e => e.habit_id === id && e.entry_date === today.value)?.value ?? 0

  // ---------- Google Календарь ----------
  const google = ref<GoogleStatus | null>(null)
  const googleBusy = ref(false)
  const googleError = ref('')
  let googleTimer: number | undefined
  let googleLastRun = 0
  const googleEnabled = () => repo.mode === 'supabase' && !!googleClientId
  const setGoogle = (st: GoogleStatus) => { google.value = st; googleError.value = '' }

  /** Узнать, подключён ли Google (без шума: ошибки не показываем наверху страницы) */
  async function refreshGoogle() {
    if (!googleEnabled()) return
    try { setGoogle(await repo.googleStatus()) } catch (e) { googleError.value = (e as Error).message }
  }
  /** Синхронизация. Фоновые запуски молчат при ошибках; ручной показывает их в блоке «Google Календарь» */
  async function syncGoogle(manual = false) {
    if (!googleEnabled() || googleBusy.value || (!manual && !google.value?.connected)) return
    googleBusy.value = true; googleLastRun = Date.now()
    try {
      const st = await repo.googleSync(); setGoogle(st)
      if (st.report && 'changed' in st.report && st.report.changed) await load()
    } catch (e) { googleError.value = (e as Error).message }
    googleBusy.value = false
  }
  /** После правки задач отправить изменения в Google (с задержкой, чтобы не слать на каждую букву) */
  function syncGoogleSoon() {
    if (!google.value?.connected) return
    window.clearTimeout(googleTimer)
    googleTimer = window.setTimeout(() => { if (googleBusy.value) syncGoogleSoon(); else void syncGoogle() }, 4000)
  }
  async function connectGoogle(code: string, redirectUri: string) {
    googleBusy.value = true; googleError.value = ''
    try {
      const st = await repo.googleConnect(code, redirectUri); setGoogle(st)
      await load()
    } catch (e) {
      googleError.value = (e as Error).message
      // страницу могли перезагрузить посреди подключения (обновление приложения): код входа одноразовый,
      // но подключение уже могло сохраниться — тогда ошибку не показываем
      try { const st = await repo.googleStatus(); if (st.connected) setGoogle(st) } catch { /* оставляем исходную ошибку */ }
    }
    googleBusy.value = false
  }
  async function disconnectGoogle() {
    googleBusy.value = true; googleError.value = ''
    try { setGoogle(await repo.googleDisconnect()) } catch (e) { googleError.value = (e as Error).message }
    googleBusy.value = false
  }
  async function setGoogleSettings(patch: GoogleSettingsPatch) {
    try { setGoogle(await repo.googleSettings(patch)) } catch (e) { googleError.value = (e as Error).message }
  }
  const setGoogleImport = (on: boolean) => setGoogleSettings({ import_events: on })
  /** Включить/выключить календарь в списке «брать события из». Хотя бы один остаётся выбранным */
  async function toggleImportCalendar(id: string, on: boolean) {
    const cur = new Set(google.value?.import_calendar_ids ?? [])
    if (on) cur.add(id); else cur.delete(id)
    if (!cur.size) return
    await setGoogleSettings({ import_calendar_ids: [...cur] })
    void syncGoogle(true)
  }
  async function setExportCalendar(id: string) { await setGoogleSettings({ export_calendar_id: id }) }
  /** Приложение снова открыли / вернулись на вкладку — подтянуть изменения из Google (не чаще раза в минуту) */
  function onVisible() {
    if (document.visibilityState === 'visible' && Date.now() - googleLastRun > 60_000) void syncGoogle()
  }
  /** Приложение на телефоне может висеть открытым днями: при возврате подтягиваем свежие данные (сферы, проекты, задачи с других устройств) */
  let lastLoad = Date.now()
  async function reloadQuietly() {
    if (!user.value || loading.value) return
    try { data.value = await repo.load(today.value, [weekStart(today.value), monthStart(today.value)].sort()[0]); lastLoad = Date.now() } catch { /* оставляем то, что есть */ }
  }
  function onShow() {
    if (document.visibilityState === 'visible' && Date.now() - lastLoad > 30_000) void reloadQuietly()
  }
  function startGoogleWatch() {
    document.removeEventListener('visibilitychange', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    document.removeEventListener('visibilitychange', onShow)
    document.addEventListener('visibilitychange', onShow)
    window.clearInterval(googleWatchTimer)
    googleWatchTimer = window.setInterval(() => void syncGoogle(), 5 * 60_000)
  }
  let googleWatchTimer: number | undefined
  function stopGoogleWatch() {
    document.removeEventListener('visibilitychange', onVisible)
    document.removeEventListener('visibilitychange', onShow)
    window.clearInterval(googleWatchTimer); window.clearTimeout(googleTimer); google.value = null
  }

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
    if (user.value) { await load(); startClock(); void startGoogle() }
    ready.value = true
  }
  async function startGoogle() {
    await refreshGoogle(); startGoogleWatch()
    if (google.value?.connected) void syncGoogle()
  }
  async function load() {
    loading.value = true
    await guard(async () => { data.value = await repo.load(today.value, [weekStart(today.value), monthStart(today.value)].sort()[0]); lastLoad = Date.now() })
    loading.value = false
  }
  async function signIn(email: string, password: string) {
    const u = await guard(() => repo.signIn(email, password))
    if (u) { user.value = u; await load(); startClock(); void startGoogle() }
    return !!u
  }
  async function signUp(email: string, password: string): Promise<'ok' | 'confirm' | 'fail'> {
    let res: 'ok' | 'confirm' | 'fail' = 'fail'
    await guard(async () => {
      const u = await repo.signUp(email, password)
      if (u) { user.value = u; await load(); startClock(); void startGoogle(); res = 'ok' } else res = 'confirm'
    })
    return res
  }
  async function signOut() {
    stopClock(); stopGoogleWatch(); await guard(() => repo.signOut()); user.value = null
    data.value = { spheres: [], projects: [], tasks: [], habits: [], recurrences: [], weekGoals: [], reviews: [], habitEntries: [], timeEntries: [] }
  }

  async function addTask(t: NewTask) {
    const task = await guard(() => repo.addTask(t)); if (task) { data.value.tasks.unshift(task); syncGoogleSoon() }
  }
  async function updateTask(id: string, patch: Partial<NewTask>) {
    const task = await guard(() => repo.updateTask(id, patch))
    if (task) {
      const i = data.value.tasks.findIndex(t => t.id === id)
      if (i >= 0) data.value.tasks[i] = task
      // выполнили повторяющуюся задачу — следующая могла создаться (режим «после выполнения»)
      if (patch.status === 'done' && task.recurrence_id) await load()
      syncGoogleSoon()
    }
  }
  /** Вернуть в работу: с датой или разобранную по сфере («Без даты») — в план, иначе во «Входящие» */
  async function toggleDone(t: Task) {
    await updateTask(t.id, { status: t.status === 'done' ? (t.due_date || t.sphere_id ? 'planned' : 'inbox') : 'done' })
  }
  async function removeTask(id: string) {
    await guard(() => repo.removeTask(id)); data.value.tasks = data.value.tasks.filter(t => t.id !== id); syncGoogleSoon()
  }
  async function addSphere(name: string, color: string, goal: number, description = '') {
    if (sphereNameTaken(name)) { error.value = `Сфера «${name}» уже есть`; return false }
    const s = await guard(() => repo.addSphere(name, color, goal, description)); if (s) data.value.spheres.push(s as Sphere)
    return !!s
  }
  const sphereNameTaken = (name: string, exceptId?: string) =>
    data.value.spheres.some(s => s.id !== exceptId && s.name.trim().toLowerCase() === name.trim().toLowerCase())
  async function updateSphere(id: string, patch: SpherePatch) {
    if (patch.name !== undefined && sphereNameTaken(patch.name, id)) { error.value = `Сфера «${patch.name}» уже есть`; return false }
    const sp = await guard(() => repo.updateSphere(id, patch)) as Sphere | undefined
    if (!sp) return false
    const i = data.value.spheres.findIndex(x => x.id === id); if (i >= 0) data.value.spheres[i] = { ...data.value.spheres[i], ...sp }
    return true
  }
  async function addProject(sphereId: string, name: string) {
    const p = await guard(() => repo.addProject(sphereId, name)); if (p) data.value.projects.push(p as Project)
    return (p as Project | undefined) ?? null
  }
  async function renameProject(id: string, name: string) {
    const ok = await guard(async () => { await repo.renameProject(id, name); return true })
    if (ok) { const p = data.value.projects.find(x => x.id === id); if (p) p.name = name }
  }
  async function removeProject(id: string) {
    const ok = await guard(async () => { await repo.removeProject(id); return true })
    if (ok) {
      data.value.projects = data.value.projects.filter(p => p.id !== id)
      for (const t of data.value.tasks) if (t.project_id === id) t.project_id = null
    }
  }
  /** Сменить сферу задачи (проект при этом сбрасывается — он принадлежал прежней сфере) */
  const setTaskSphere = (id: string, sphereId: string | null) => updateTask(id, { sphere_id: sphereId, project_id: null })
  /** «Без даты»: задача разобрана, но без срока — уходит из «Входящих» в список «Без даты». place — заодно поставить сферу/проект */
  const setTaskNoDate = (id: string, place?: { sphere_id: string | null; project_id: string | null }) =>
    updateTask(id, { status: 'planned', due_date: null, start_time: null, remind_before_minutes: null, ...place })
  /** Поставить проект (сфера берётся из проекта); null — оставить в сфере без проекта */
  /** Архивация проекта: сначала переносим незавершённые задачи (moves: id задачи → куда), потом сам проект уходит в архив */
  async function archiveProject(id: string, moves: Record<string, { sphere_id: string | null; project_id: string | null }>) {
    for (const [taskId, to] of Object.entries(moves)) {
      await updateTask(taskId, { sphere_id: to.sphere_id, project_id: to.project_id })
      if (error.value) return false
    }
    const ok = await guard(async () => { await repo.archiveProject(id); return true })
    if (ok) { const p = data.value.projects.find(x => x.id === id); if (p) p.status = 'archived' }
    return !!ok
  }
  /**
   * Архивация сферы. plan: что делать с проектами (id → id сферы или 'archive'), с задачами (id → куда), с привычками (id → сфера или 'archive'),
   * с повторяющимися задачами (id → сфера или null). Порядок: проекты, задачи, шаблоны повторов, привычки, сама сфера.
   */
  async function archiveSphere(id: string, plan: SpherePlan) {
    if (!sphereById(id)) return false
    const r = running.value
    if (r && r.sphere_id === id && !r.task_id && !r.habit_id) await stopTimer()
    for (const [pid, to] of Object.entries(plan.projects)) {
      if (to === 'archive') {
        const moves = Object.fromEntries(Object.entries(plan.tasks).filter(([tid]) => data.value.tasks.find(t => t.id === tid)?.project_id === pid))
        if (!(await archiveProject(pid, moves))) return false
      } else if (!(await moveProject(pid, to))) return false
    }
    for (const [tid, to] of Object.entries(plan.tasks)) {
      const t = data.value.tasks.find(x => x.id === tid)
      if (!t || t.sphere_id !== id) continue            // уже перенесена вместе с проектом
      await updateTask(tid, { sphere_id: to.sphere_id, project_id: to.project_id })
      if (error.value) return false
    }
    for (const [rid, to] of Object.entries(plan.recurrences)) {
      if (!(await guard(async () => { await repo.moveRecurrence(rid, to); return true }))) return false
    }
    for (const [hid, to] of Object.entries(plan.habits)) {
      const ok = to === 'archive' ? await removeHabit(hid) : await guard(async () => { await repo.moveHabit(hid, to); return true })
      if (!ok) return false
    }
    const ok = await guard(async () => { await repo.archiveSphere(id); return true })
    if (!ok) return false
    const sp = sphereById(id)
    data.value.spheres = data.value.spheres.filter(x => x.id !== id)
    if (sp) data.value.archivedSpheres = [sp, ...(data.value.archivedSpheres ?? [])]
    await reloadQuietly()
    return true
  }
  /** Вернуть сферу из архива (newName — если прежнее название уже занято другой сферой) */
  async function restoreSphere(id: string, newName?: string) {
    const ok = await guard(async () => { await repo.restoreSphere(id, newName); return true })
    if (!ok) return false
    await reloadQuietly()
    return true
  }
  /** Перенос проекта в другую сферу: задачи и время переезжают на сервере, поэтому после переноса тихо перечитываем данные */
  async function moveProject(id: string, sphereId: string) {
    const ok = await guard(async () => { await repo.moveProject(id, sphereId); return true })
    if (!ok) return false
    const p = data.value.projects.find(x => x.id === id); if (p) p.sphere_id = sphereId
    await reloadQuietly()
    return true
  }
  async function restoreProject(id: string) {
    const ok = await guard(async () => { await repo.restoreProject(id); return true })
    if (ok) { const p = data.value.projects.find(x => x.id === id); if (p) p.status = 'active' }
    return !!ok
  }
  const setTaskProject = (id: string, projectId: string | null, sphereId: string | null) => updateTask(id, { project_id: projectId, ...(projectId ? { sphere_id: projectById(projectId)?.sphere_id ?? sphereId } : { sphere_id: sphereId }) })
  async function addHabit(h: NewHabit) {
    const x = await guard(() => repo.addHabit(h)); if (x) { data.value.habits.push(x as Habit); await reloadQuietly() }
  }
  async function updateHabit(id: string, patch: Partial<NewHabit>) {
    const h = await guard(() => repo.updateHabit(id, patch)) as Habit | undefined
    if (!h) return false
    const i = data.value.habits.findIndex(x => x.id === id); if (i >= 0) data.value.habits[i] = h
    await reloadQuietly() // расписание могло измениться — состояние привычек на сегодня считает база
    return true
  }
  async function removeHabit(id: string) {
    const ok = await guard(async () => { await repo.archiveHabit(id); return true })
    if (ok) data.value.habits = data.value.habits.filter(h => h.id !== id)
    return !!ok
  }
  const habitDays = (from: string, to: string) => guard(() => repo.habitDays(from, to)) as Promise<HabitDay[] | undefined>
  const titleOfEntry = (r: TimeEntry) =>
    r.task_id ? (data.value.tasks.find(t => t.id === r.task_id)?.title ?? 'Задача')
      : r.habit_id ? (data.value.habits.find(h => h.id === r.habit_id)?.name ?? 'Привычка')
        : (sphereById(r.sphere_id)?.name ?? 'Таймер')
  const noteLong = (r: TimeEntry, title: string) => {
    const sec = entrySeconds(r)
    if (sec / 60 >= FORGOTTEN_MINUTES) longStop.value = { id: r.id, title, started_at: r.started_at, seconds: sec }
  }
  async function startTimer(target: { task_id?: string; habit_id?: string; sphere_id?: string }) {
    const prev = running.value
    const prevTitle = prev ? titleOfEntry(prev) : ''
    const e = await guard(() => repo.startTimer(target))
    if (e) {
      if (prev) { prev.ended_at = new Date().toISOString(); noteLong(prev, prevTitle) }
      data.value.timeEntries.push(e)
    }
  }
  async function stopTimer() {
    const title = running.value ? titleOfEntry(running.value) : ''
    const e = await guard(() => repo.stopTimer())
    if (e) {
      const i = data.value.timeEntries.findIndex(x => x.id === e.id); if (i >= 0) data.value.timeEntries[i] = e
      noteLong(e, title)
    }
  }
  /** Исправить время только что остановленного долгого таймера: запись начинается там же, длится minutes минут */
  async function fixLongStop(minutes: number) {
    const l = longStop.value; if (!l) return false
    const from = new Date(l.started_at)
    const ok = await updateEntry(l.id, from.toISOString(), new Date(from.getTime() + Math.max(1, Math.round(minutes)) * 60000).toISOString())
    if (ok) longStop.value = null
    return ok
  }
  const dismissLongStop = () => { longStop.value = null }
  async function addRecurrence(r: NewRecurrence) {
    const ok = await guard(async () => { await repo.addRecurrence(r); return true })
    if (ok) { await load(); syncGoogleSoon() }
    return !!ok
  }
  async function removeRecurrence(id: string) {
    await guard(() => repo.removeRecurrence(id)); await load()
  }
  /** Повтор из карточки задачи: подключить, изменить, отключить. После — перечитываем: будущие задачи пересоздаются в базе */
  async function recurrenceOp(fn: () => Promise<void>) {
    const ok = await guard(async () => { await fn(); return true })
    if (ok) { await load(); syncGoogleSoon() }
    return !!ok
  }
  const attachRecurrence = (taskId: string, r: NewRecurrence) => recurrenceOp(() => repo.attachRecurrence(taskId, r))
  const updateRecurrence = (id: string, patch: RecurrencePatch, keepTaskId?: string) => recurrenceOp(() => repo.updateRecurrence(id, patch, keepTaskId))
  const detachRecurrence = (id: string, keepTaskId: string) => recurrenceOp(() => repo.detachRecurrence(id, keepTaskId))
  /** day — день, который смотрит человек (например, в «Календаре»): по нему фильтруются записи и подставляется дата новой записи */
  const openEditor = (target: EditorTarget, title: string, day?: string) => { editor.value = { target, title, day } }
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
  // ---- Бюджет времени: сон и текучка (в день), работа (в неделю)
  const DEFAULT_BUDGET: TimeBudget = { sleep_minutes_per_day: 480, routine_minutes_per_day: 180 }
  const timeBudget = computed(() => data.value.timeBudget ?? DEFAULT_BUDGET)
  /** false — в Supabase не выполнен planner_time_budget.sql: считаем по значениям по умолчанию, сохранить нельзя */
  const timeBudgetReady = computed(() => data.value.timeBudget !== null)
  /** Часы работы недели: заданные на неё, иначе последние заданные раньше, иначе 0 */
  function workFor(week: string): number {
    let best: { week_start: string; minutes: number } | null = null
    for (const w of data.value.weekWork ?? []) if (w.week_start <= week && (!best || w.week_start > best.week_start)) best = w
    return best?.minutes ?? 0
  }
  const hasOwnWork = (week: string) => (data.value.weekWork ?? []).some(w => w.week_start === week)
  async function saveTimeBudget(patch: Partial<TimeBudget>) {
    const ok = await guard(async () => { await repo.saveTimeBudget(patch); return true })
    if (ok) data.value.timeBudget = { ...timeBudget.value, ...patch }
    return !!ok
  }
  async function setWeekWork(week: string, minutes: number) {
    const m = Math.max(0, Math.round(minutes))
    const ok = await guard(async () => { await repo.setWeekWork(week, m); return true })
    if (ok) {
      const list = (data.value.weekWork ??= []); const w = list.find(x => x.week_start === week)
      if (w) w.minutes = m; else list.push({ week_start: week, minutes: m })
    }
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
    nudgeActive, forgotten, weekMinutes, monthMinutes, taskTotals, sphereById, archivedSpheres, archiveSphere, restoreSphere, projectById, projectsOf, archivedProjectsOf, archiveProject, restoreProject, moveProject, addProject, renameProject, removeProject, setTaskSphere, setTaskNoDate, setTaskProject, habitValue, habitIsDone, reorderHabits, addDays,
    init, load, signIn, signUp, signOut, addTask, updateTask, toggleDone, removeTask, addSphere, updateSphere, sphereNameTaken, addHabit, updateHabit, removeHabit, habitDays, habitStatusOf, dueHabits, laterHabits, habitDetailId, openHabit, closeHabit,
    timeBudget, timeBudgetReady, workFor, hasOwnWork, saveTimeBudget, setWeekWork,
    goalFor, reviewFor, currentReview, setWeekGoal, weekData, saveReview, exportAll, savePush, removePush,
    google, googleBusy, googleError, refreshGoogle, syncGoogle, connectGoogle, disconnectGoogle, setGoogleImport, setGoogleSettings, toggleImportCalendar, setExportCalendar,
    startTimer, stopTimer, bumpHabit, addRecurrence, removeRecurrence, attachRecurrence, updateRecurrence, detachRecurrence,
    detailId, openTask, closeTask, editor, openEditor, closeEditor, longStop, fixLongStop, dismissLongStop, addEntry, updateEntry, removeEntry, listEntries,
  }
})
