import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repo } from '../data'
import type { Subtask, CycleDay, CycleSettings, PillCourse, TimeBudget, RecurrencePatch, SpherePlan, GoogleSettingsPatch, GoogleStatus, Project, PushSub, ExportData, ReviewInput, WeekData, WeeklyReview, EditorTarget, Habit, HabitDay, HabitEntry, HabitStatus, NewHabit, NewRecurrence, NewTask, Snapshot, Sphere, SpherePatch, Task, TimeEntry, User, WishPatch } from '../types'
import { googleClientId } from '../lib/google'
import { parseTags, uniqTags } from '../lib/tags'
import { byPosition } from '../lib/taskOrder'
import { DEFAULT_CYCLE_SETTINGS, PILL_NAMES, courseFrom, courseOn, cycleDayNo, cycleStarts } from '../lib/cycle'
import { DEFAULT_SPHERE_COLORS } from '../lib/colors'
import { addDays, dayOf, entrySeconds, monthStart, todayStr, weekStart } from '../lib/time'

const WISH_CATEGORIES = ['Купить', 'Поехать', 'Попробовать', 'Научиться']
export const NUDGE_MINUTES = 40
export type PostponeKind = 'tomorrow' | 'weekend' | 'nextweek'
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
  // ---- Отложено без даты: разобранные задачи (есть сфера), но без даты. Если не трогали staleDays дней — «пора решить»
  const STALE_KEY = 'planner-stale-days'
  const staleDays = ref((() => { try { const n = Number(localStorage.getItem(STALE_KEY)); return n >= 1 ? n : 30 } catch { return 30 } })())
  function setStaleDays(n: number) {
    staleDays.value = Math.min(365, Math.max(1, Math.round(n || 30)))
    try { localStorage.setItem(STALE_KEY, String(staleDays.value)) } catch { /* не страшно */ }
  }
  const isStale = (t: Task) => !!t.updated_at && dayOf(t.updated_at) <= addDays(today.value, -staleDays.value)
  const deferred = computed(() => data.value.tasks.filter(t => t.status === 'planned' && !t.due_date).sort(byPosition))
  /** Залежались: возвращаются в основной список «Входящих» с вопросом «решить?» */
  const staleDeferred = computed(() => deferred.value.filter(isStale))
  const freshDeferred = computed(() => deferred.value.filter(t => !isStale(t)))
  /** «Ещё отложить»: задача остаётся без даты, счётчик дней начинается заново */
  const snoozeTask = (id: string) => updateTask(id, { status: 'planned' })
  /** «Входящие»: в своём порядке (перетаскиванием), задачи, которые не двигали, — сверху, новые первыми */
  const inbox = computed(() => data.value.tasks.filter(t => t.status === 'inbox').sort(byPosition))
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

  // ---- Учтённое время. Законченные записи считаются один раз (от часов не зависят), а живые секунды идущего таймера
  // добавляются отдельно — иначе каждую секунду пересчитывались бы все записи и перерисовывались все строки задач
  /** минуты по сферам с даты from — только законченные записи */
  function closedSphereMinutesSince(from: string) {
    const res: Record<string, number> = {}
    for (const e of data.value.timeEntries) {
      if (!e.ended_at || !e.sphere_id || dayOf(e.started_at) < from) continue
      res[e.sphere_id] = (res[e.sphere_id] ?? 0) + entrySeconds(e) / 60
    }
    return res
  }
  /** + идущий таймер, если он начат не раньше from */
  function withRunning(closed: Record<string, number>, from: string) {
    const r = running.value
    if (!r?.sphere_id || dayOf(r.started_at) < from) return closed
    return { ...closed, [r.sphere_id]: (closed[r.sphere_id] ?? 0) + runningSeconds.value / 60 }
  }
  const closedWeekMinutes = computed(() => closedSphereMinutesSince(weekStart(today.value)))
  const closedMonthMinutes = computed(() => closedSphereMinutesSince(monthStart(today.value)))
  const weekMinutes = computed(() => withRunning(closedWeekMinutes.value, weekStart(today.value)))
  const monthMinutes = computed(() => withRunning(closedMonthMinutes.value, monthStart(today.value)))
  /** секунды по задачам за неделю и за месяц — только законченные записи */
  const closedTaskTotals = computed(() => {
    const w = weekStart(today.value), m = monthStart(today.value)
    const res: Record<string, { week: number; month: number }> = {}
    for (const e of data.value.timeEntries) {
      if (!e.task_id || !e.ended_at) continue
      const d = dayOf(e.started_at), sec = entrySeconds(e)
      const r = (res[e.task_id] ??= { week: 0, month: 0 })
      if (d >= w) r.week += sec
      if (d >= m) r.month += sec
    }
    return res
  })
  /** Время задачи за неделю и месяц; живые секунды читает только строка задачи, на которую идёт таймер */
  function taskTotal(id: string): { week: number; month: number } {
    const base = closedTaskTotals.value[id] ?? { week: 0, month: 0 }
    const r = running.value
    if (r?.task_id !== id) return base
    const d = dayOf(r.started_at), sec = runningSeconds.value
    return { week: base.week + (d >= weekStart(today.value) ? sec : 0), month: base.month + (d >= monthStart(today.value) ? sec : 0) }
  }
  /** Цель сферы на неделю: цель именно этой недели или значение по умолчанию */
  function goalFor(sphereId: string, week: string = weekStart(today.value)): number {
    const g = data.value.weekGoals.find(x => x.sphere_id === sphereId && x.week_start === week)
    return g ? g.minutes : (data.value.spheres.find(s => s.id === sphereId)?.weekly_goal_minutes ?? 0)
  }
  const reviewFor = (week: string): WeeklyReview | undefined => data.value.reviews.find(r => r.week_start === week)
  const currentReview = computed(() => reviewFor(weekStart(today.value)))
  // ---- Окно активности привычки: вне его привычка не запланирована (у таблеток окно — курсы из календаря цикла)
  const pillHabitIds = computed(() => { const s = data.value.cycle?.settings; return [s?.morning_habit_id, s?.evening_habit_id].filter(Boolean) as string[] })
  const isPillHabit = (id: string) => pillHabitIds.value.includes(id)
  function habitActiveOn(h: Habit, d: string): boolean {
    if (isPillHabit(h.id)) return !!courseOn(d, data.value.cycle?.courses ?? [])
    return (!h.active_from || d >= h.active_from) && (!h.active_until || d <= h.active_until)
  }
  /** Ближайший день после d, когда привычка снова станет активной */
  function nextActive(h: Habit, d: string): string | null {
    if (isPillHabit(h.id)) return (data.value.cycle?.courses ?? []).map(c => c.starts_on).filter(x => x > d).sort()[0] ?? null
    return h.active_from && h.active_from > d ? h.active_from : null
  }
  /** Состояние привычки на сегодня. Если база его не прислала — считаем запланированной */
  const habitStatusOf = (id: string): HabitStatus => {
    const st = data.value.habitStatus?.find(s => s.habit_id === id) ?? { habit_id: id, scheduled: true, due: null, last_done: null }
    const h = data.value.habits.find(x => x.id === id)
    return !h || habitActiveOn(h, today.value) ? st : { ...st, scheduled: false, due: nextActive(h, today.value) }
  }
  const activeToday = (h: Habit) => habitActiveOn(h, today.value)
  const dueHabits = computed(() => data.value.habits.filter(h => activeToday(h) && habitStatusOf(h.id).scheduled))
  const laterHabits = computed(() => data.value.habits.filter(h => activeToday(h) && !habitStatusOf(h.id).scheduled))
  /** Вне окна активности (например, таблетки между курсами) */
  const inactiveHabits = computed(() => data.value.habits.filter(h => !activeToday(h)))
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
  /** Свой порядок сфер: сразу на экране, потом в базе; при ошибке — как было */
  async function reorderSpheres(ids: string[]) {
    const before = data.value.spheres
    const byId = new Map(before.map(s => [s.id, s]))
    data.value.spheres = [...ids.map(id => byId.get(id)!).filter(Boolean), ...before.filter(s => !ids.includes(s.id))]
    const ok = await guard(async () => { await repo.reorderSpheres(ids); return true })
    if (!ok) data.value.spheres = before
    return !!ok
  }
  /** Свой порядок проектов одной сферы: в общем списке они встают на свои же места */
  async function reorderProjects(ids: string[]) {
    const before = data.value.projects
    const set = new Set(ids); let k = 0
    const byId = new Map(before.map(p => [p.id, p]))
    data.value.projects = before.map(p => (set.has(p.id) ? byId.get(ids[k++])! : p))
    const ok = await guard(async () => { await repo.reorderProjects(ids); return true })
    if (!ok) data.value.projects = before
    return !!ok
  }
  /** Свой порядок задач списка (ids — задачи в новом порядке). Сразу на экране, потом в базе; при ошибке — как было */
  const orderReady = computed(() => data.value.orderReady !== false)
  /** false — в Supabase не выполнен planner_subtasks.sql */
  const subtasksReady = computed(() => data.value.subtasksReady !== false)
  // ---- «↷ Перенести»: завтра / на выходные (суббота) / на следующую неделю (понедельник), от сегодняшнего дня;
  // время начала не меняется. Каждый перенос записывается в историю задачи (postpones)
  const postponesReady = computed(() => data.value.postponesReady !== false)
  /** Окно переноса (кнопка «Перенести…» в уведомлении) */
  const postponeSheetId = ref<string | null>(null)
  const openPostponeSheet = (id: string) => { postponeSheetId.value = id }
  const closePostponeSheet = () => { postponeSheetId.value = null }
  /** Короткое сообщение внизу экрана */
  const notice = ref('')
  let noticeTimer: number | undefined
  function showNotice(text: string) {
    notice.value = text
    window.clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => { notice.value = '' }, 3000)
  }
  function postponeTarget(kind: PostponeKind, from: string = today.value): string {
    if (kind === 'tomorrow') return addDays(from, 1)
    if (kind === 'nextweek') return addDays(weekStart(from), 7)
    const [y, m, d] = from.split('-').map(Number)
    const wd = new Date(y, m - 1, d).getDay()          // 0 — воскресенье, 6 — суббота
    return addDays(from, ((6 - wd + 7) % 7) || 7)      // ближайшая суббота после сегодня (в субботу — следующая)
  }
  /** kind — готовый вариант; или своя дата и время ({ date, time }: time '' — без времени, 'HH:MM' — новое) */
  async function postponeTask(id: string, kind: PostponeKind | { date: string; time: string }): Promise<string | null> {
    const t = data.value.tasks.find(x => x.id === id); if (!t) return null
    const custom = typeof kind === 'object' ? kind : null
    const to = custom ? custom.date : postponeTarget(kind as PostponeKind)
    const time = custom ? (custom.time ? custom.time + ':00' : null) : t.start_time
    if (t.due_date === to && time === t.start_time) return to
    if (t.recurrence_id && data.value.tasks.some(x => x.id !== id && x.recurrence_id === t.recurrence_id && x.due_date === to)) {
      error.value = `В этот день уже есть «${t.title}» по тому же повтору — перенести нельзя.`; return null
    }
    const patch: Partial<NewTask> = { due_date: to, ...(t.status === 'inbox' ? { status: 'planned' as const } : {}) }
    // своё время: без времени — напоминать не о чем
    if (custom) Object.assign(patch, { start_time: time, ...(time ? {} : { remind_before_minutes: null }) })
    if (postponesReady.value) patch.postpones = [...(t.postpones ?? []), { from: t.due_date, to, at: new Date().toISOString() }]
    await updateTask(id, patch)
    return error.value ? null : to
  }
  /** Подзадачи сохраняются сразу (отметили, добавили, переставили); на экране — до ответа базы, при ошибке — как было */
  async function setSubtasks(taskId: string, list: Subtask[]) {
    const t = data.value.tasks.find(x => x.id === taskId); if (!t) return false
    const before = t.subtasks
    t.subtasks = list
    await updateTask(taskId, { subtasks: list })
    if (error.value) { const x = data.value.tasks.find(y => y.id === taskId); if (x) x.subtasks = before; return false }
    return true
  }
  async function reorderTasks(ids: string[]) {
    const before = new Map(data.value.tasks.map(t => [t.id, t.position]))
    ids.forEach((id, i) => { const t = data.value.tasks.find(x => x.id === id); if (t) t.position = i })
    const ok = await guard(async () => { await repo.reorderTasks(ids); return true })
    if (!ok) for (const t of data.value.tasks) t.position = before.get(t.id) ?? null
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
  /** syncing — идёт тихая загрузка; holdReloads — выполняется действие из уведомления: его не должен затереть устаревший ответ сервера */
  const syncing = ref(false)
  const holdReloads = ref(false)
  async function reloadQuietly() {
    if (!user.value || loading.value || holdReloads.value) return
    syncing.value = true
    try { data.value = await repo.load(today.value, [weekStart(today.value), monthStart(today.value)].sort()[0]); lastLoad = Date.now(); saveCache() } catch { /* оставляем то, что есть */ }
    syncing.value = false
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
      // каждую секунду часы нужны только идущему таймеру; без него хватит раза в 30 секунд (меньше пересчётов, меньше расход батареи)
      const t0 = Date.now()
      if (running.value || t0 - now.value >= 30_000) now.value = t0
      const t = todayStr()
      if (t !== today.value) { today.value = t; void load() } // наступила полночь — новый день
    }, 1000)
  }
  function stopClock() { if (tick) window.clearInterval(tick); tick = undefined }

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try { error.value = ''; return await fn() } catch (e) { error.value = (e as Error).message; return undefined }
  }

  // ---- Быстрый запуск: последний снимок данных хранится на устройстве. Приложение сразу показывает его,
  // а свежие данные с сервера подтягивает в фоне (обычно это меньше секунды). В демо-режиме данные и так локальные
  const CACHE_KEY = 'kola-snapshot-v1'
  function readCache(uid: string): Snapshot | null {
    if (repo.mode === 'demo') return null
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { uid: string; day: string; data: Snapshot } | null
      if (!c || c.uid !== uid) return null
      // снимок прошлого дня: отметки привычек и их расписание относятся ко вчера — до свежих данных их не показываем
      return c.day === today.value ? c.data : { ...c.data, habitEntries: [], habitStatus: [] }
    } catch { return null }
  }
  function saveCache() {
    if (repo.mode === 'demo' || !user.value) return
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: user.value.id, day: today.value, data: data.value })) } catch { /* места нет — просто запустимся медленнее */ }
  }
  function clearCache() { try { localStorage.removeItem(CACHE_KEY) } catch { /* нечего удалять */ } }
  // приложение свернули — сохранить то, что изменилось после последней загрузки
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && user.value) saveCache() })

  async function init() {
    user.value = await guard(() => repo.session()) ?? null
    if (user.value) {
      const cached = readCache(user.value.id)
      if (cached) {
        data.value = cached
        ready.value = true
        startClock(); void load(); void startGoogle()
        return
      }
      await load(); startClock(); void startGoogle()
    }
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
    saveCache()
  }
  /** «Потянуть вниз»: свежие данные с сервера (Google — в фоне). refreshTick — сигнал экранам, которые грузят что-то сами (итог недели) */
  const refreshTick = ref(0)
  async function refresh() {
    if (!user.value) return
    void syncGoogle()
    await load()
    refreshTick.value++
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
    stopClock(); stopGoogleWatch(); await guard(() => repo.signOut()); user.value = null; clearCache()
    data.value = { spheres: [], projects: [], tasks: [], habits: [], recurrences: [], weekGoals: [], reviews: [], habitEntries: [], timeEntries: [] }
  }

  /** Новая задача: «#теги» из названия становятся тегами (если теги не переданы явно). Пока тегов в базе нет — текст не трогаем */
  async function addTask(t: NewTask) {
    if (!t.tags && tagsReady.value) { const p = parseTags(t.title); t = { ...t, title: p.title, tags: p.tags } }
    const task = await guard(() => repo.addTask(t)); if (task) { data.value.tasks.unshift(task); syncGoogleSoon() }
    return task
  }
  async function updateTask(id: string, patch: Partial<NewTask>) {
    const wasDone = data.value.tasks.find(t => t.id === id)?.status === 'done'
    const task = await guard(() => repo.updateTask(id, patch))
    if (task) {
      const i = data.value.tasks.findIndex(t => t.id === id)
      if (i >= 0) data.value.tasks[i] = task
      if (wasDone !== (task.status === 'done')) await syncWishWithTask(task)
      // выполнили повторяющуюся задачу — следующая могла создаться (режим «после выполнения»)
      if (patch.status === 'done' && task.recurrence_id) await load()
      syncGoogleSoon()
    }
  }
  /** Вернуть в работу: с датой — в план; без даты — в «Отложено», если задача уже была разобрана по сфере, иначе во «Входящие» */
  async function toggleDone(t: Task) {
    await updateTask(t.id, { status: t.status === 'done' ? (t.due_date || t.sphere_id ? 'planned' : 'inbox') : 'done' })
  }
  async function removeTask(id: string) {
    await guard(() => repo.removeTask(id)); data.value.tasks = data.value.tasks.filter(t => t.id !== id); syncGoogleSoon()
  }
  // ---- Мои желания: записи без дат и сроков. Новые — наверху, порядок меняется перетаскиванием
  const wishesReady = computed(() => data.value.wishesReady !== false)
  const wishes = computed(() => data.value.wishes ?? [])
  const activeWishes = computed(() => wishes.value.filter(w => !w.fulfilled_at).sort((a, b) => a.position - b.position))
  const fulfilledWishes = computed(() => wishes.value.filter(w => w.fulfilled_at).sort((a, b) => b.fulfilled_at!.localeCompare(a.fulfilled_at!)))
  /** Категории для выбора: те, что уже используются, и несколько стартовых */
  const wishCategories = computed(() => [...new Set([...WISH_CATEGORIES, ...wishes.value.map(w => w.category).filter((c): c is string => !!c)])])
  async function addWish(title: string, category: string | null) {
    const position = Math.min(1, ...activeWishes.value.map(w => w.position)) - 1
    const w = await guard(() => repo.addWish({ title, category, position }))
    if (w) (data.value.wishes ??= []).push(w)
    return !!w
  }
  async function updateWish(id: string, patch: WishPatch) {
    const w = await guard(() => repo.updateWish(id, patch))
    if (w) { const i = wishes.value.findIndex(x => x.id === id); if (i >= 0) data.value.wishes![i] = w }
    return !!w
  }
  async function removeWish(id: string) {
    const ok = await guard(async () => { await repo.removeWish(id); return true })
    if (ok) data.value.wishes = wishes.value.filter(x => x.id !== id)
    return !!ok
  }
  /** Порядок: ids — видимые желания в новом порядке (при отборе); скрытые остаются на своих местах */
  async function reorderWishes(ids: string[]) {
    const all = activeWishes.value.map(w => w.id), set = new Set(ids)
    let k = 0
    const next = all.map(id => (set.has(id) ? ids[k++] : id))
    const before = new Map(wishes.value.map(w => [w.id, w.position]))
    next.forEach((id, i) => { const w = wishes.value.find(x => x.id === id); if (w) w.position = i })
    const ok = await guard(async () => { await repo.reorderWishes(next); return true })
    if (!ok) for (const w of wishes.value) w.position = before.get(w.id) ?? 0
    return !!ok
  }
  /** Задачу из желания выполнили — желание исполнилось; вернули задачу в работу — вернулось и желание */
  async function syncWishWithTask(task: Task) {
    const w = wishes.value.find(x => x.task_id === task.id); if (!w) return
    if (task.status === 'done' && !w.fulfilled_at) await updateWish(w.id, { fulfilled_at: task.done_at ?? new Date().toISOString() })
    else if (task.status !== 'done' && w.fulfilled_at) await updateWish(w.id, { fulfilled_at: null })
  }
  /** Желание → задача во «Входящих» (заметка и ссылка — в описание, цена — в бюджет). Само желание остаётся */
  async function wishToTask(id: string) {
    const w = wishes.value.find(x => x.id === id); if (!w) return false
    const task = await addTask({
      title: w.title, status: 'inbox', note: [w.note, w.url].filter(Boolean).join('\n') || null,
      ...(budgetReady.value && w.price != null ? { budget: Number(w.price) } : {}),
    })
    return task ? updateWish(id, { task_id: task.id }) : false
  }

  // ---- Цвета для сфер: свой набор из «Ещё» или набор по умолчанию
  const colorsReady = computed(() => data.value.colorsReady !== false)
  const hasOwnColors = computed(() => !!data.value.sphereColors?.length)
  const sphereColors = computed(() => (data.value.sphereColors?.length ? data.value.sphereColors : DEFAULT_SPHERE_COLORS))
  async function saveSphereColors(colors: string[] | null) {
    const ok = await guard(async () => { await repo.saveSphereColors(colors); return true })
    if (ok) data.value.sphereColors = colors
    return !!ok
  }
  /** Раскрасить все сферы цветами набора по порядку; цветов меньше, чем сфер, — идут по кругу */
  async function recolorSpheres() {
    const list = sphereColors.value
    let ok = true
    for (const [i, s] of data.value.spheres.entries()) {
      const color = list[i % list.length]
      if (s.color.toLowerCase() !== color.toLowerCase()) ok = (await updateSphere(s.id, { color })) && ok
    }
    return ok
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
  /** Сфера → проект в другой сфере: всё переносит база одной транзакцией, потом перечитываем данные */
  async function sphereToProject(id: string, targetId: string) {
    const projectId = await guard(() => repo.sphereToProject(id, targetId))
    if (projectId) await load()
    return projectId ?? null
  }
  async function restoreProject(id: string) {
    const ok = await guard(async () => { await repo.restoreProject(id); return true })
    if (ok) { const p = data.value.projects.find(x => x.id === id); if (p) p.status = 'active' }
    return !!ok
  }
  const setTaskProject = (id: string, projectId: string | null, sphereId: string | null) => updateTask(id, { project_id: projectId, ...(projectId ? { sphere_id: projectById(projectId)?.sphere_id ?? sphereId } : { sphere_id: sphereId }) })
  async function addHabit(h: NewHabit) {
    const x = await guard(() => repo.addHabit(h)); if (x) { data.value.habits.push(x as Habit); await reloadQuietly() }
    return !!x
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
  /**
   * Дни привычек: база не знает про окно активности, поэтому дни вне окна помечаем незапланированными здесь.
   * Таблетки (каждый день курса) запланированы во все дни курсов — даже если курс отметили задним числом, раньше создания привычки
   */
  async function habitDays(from: string, to: string): Promise<HabitDay[] | undefined> {
    const r = await guard(() => repo.habitDays(from, to))
    return r?.map(x => {
      const h = data.value.habits.find(y => y.id === x.habit_id)
      if (!h) return x
      const scheduled = isPillHabit(h.id) ? habitActiveOn(h, x.day) : x.scheduled && habitActiveOn(h, x.day)
      return scheduled === x.scheduled ? x : { ...x, scheduled }
    })
  }
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

  // ---------- Теги и поиск ----------
  /** false — в Supabase не выполнен planner_tags.sql */
  const tagsReady = computed(() => data.value.tagsReady !== false)
  /** false — в Supabase не выполнен planner_budget.sql */
  const budgetReady = computed(() => data.value.budgetReady !== false)
  /** Все теги с числом задач (и повторов), самые частые — первыми */
  const allTags = computed(() => {
    const n = new Map<string, number>()
    for (const t of data.value.tasks) for (const g of t.tags ?? []) n.set(g, (n.get(g) ?? 0) + 1)
    for (const r of data.value.recurrences) for (const g of r.tags ?? []) if (!n.has(g)) n.set(g, 0)
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }))
  })
  /** Переименовать / слить с существующим / удалить (to = null) */
  async function renameTag(from: string, to: string | null) {
    const target = to === null ? null : (uniqTags([to])[0] ?? null)
    if (to !== null && !target) { error.value = 'Тег — буквы, цифры, «_» или «-», начинается с буквы'; return false }
    const ok = await guard(async () => { await repo.renameTag(from, target); return true })
    if (ok) await load()
    return !!ok
  }
  /** Окно поиска (null — закрыто); открывается с готовым запросом, например «#звонки» */
  const searchQuery = ref<string | null>(null)
  const openSearch = (q = '') => { searchQuery.value = q }
  const closeSearch = () => { searchQuery.value = null }
  const isodow = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return ((new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7) + 1 }
  /**
   * Привычку — в повторяющуюся задачу: правило с тем же расписанием, сфера та же; у привычки с таймером норма становится оценкой времени.
   * Сама привычка уходит в архив (история отметок и время остаются в базе)
   */
  async function habitToTask(id: string) {
    const h = data.value.habits.find(x => x.id === id); if (!h) return false
    const freq = h.freq ?? 'day', mode = h.mode ?? 'schedule'
    // «по расписанию» — сохраняем отсчёт (от него считаются «каждые N»); «после выполнения» — первый раз сегодня или когда привычка и так ждёт
    const due = habitStatusOf(id).due
    const startsOn = mode === 'schedule' ? (h.starts_on ?? (h.created_at ? dayOf(h.created_at) : today.value)) : (due && due > today.value ? due : today.value)
    const ok = await addRecurrence({
      title: h.name, note: h.kind === 'counter' && h.target_value ? `Норма: ${h.target_value} раз` : null,
      sphere_id: h.sphere_id, project_id: null, start_time: null, remind_before_minutes: null,
      estimate_minutes: h.kind === 'timer' ? h.target_value : null,
      freq, interval_n: h.interval_n ?? 1, mode, starts_on: startsOn,
      weekdays: freq === 'week' && mode === 'schedule' ? [...(h.weekdays?.length ? h.weekdays : [isodow(startsOn)])].sort() : null,
    })
    return ok && removeHabit(id)
  }
  /**
   * Повторяющуюся задачу — в привычку с тем же расписанием (нужна сфера). С оценкой времени — привычка с таймером на это время, иначе простая.
   * Правило удаляется вместе с будущими невыполненными задачами; эта задача тоже, если она не выполнена и времени по ней не записано
   */
  async function taskToHabit(taskId: string) {
    const t = data.value.tasks.find(x => x.id === taskId)
    const r = data.value.recurrences.find(x => x.id === t?.recurrence_id)
    if (!t || !r || !t.sphere_id) return false
    const est = t.estimate_minutes ?? r.estimate_minutes
    const ok = await addHabit({
      name: t.title, kind: est ? 'timer' : 'plain', target_value: est ?? null, sphere_id: t.sphere_id,
      freq: r.freq, interval_n: r.interval_n, mode: r.mode,
      starts_on: r.mode === 'schedule' ? r.starts_on : (t.due_date && t.due_date > today.value ? t.due_date : today.value),
      weekdays: r.weekdays?.length ? [...r.weekdays] : r.freq === 'week' ? [isodow(r.starts_on)] : [1, 2, 3, 4, 5, 6, 7],
    })
    if (!ok) return false
    if (!(await guard(async () => { await repo.removeRecurrence(r.id); return true }))) return false
    const left = data.value.tasks.find(x => x.id === taskId)
    if (left && left.status !== 'done' && !taskTotal(taskId).month) await guard(() => repo.removeTask(taskId))
    await load(); syncGoogleSoon()
    return !error.value
  }
  async function addRecurrence(r: NewRecurrence) {
    if (!r.tags && tagsReady.value) { const p = parseTags(r.title); r = { ...r, title: p.title, tags: p.tags } }
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
  // желания добавляем здесь: серверная export_all про них не знает
  const exportAll = async () => {
    const d = await (guard(() => repo.exportAll()) as Promise<ExportData | undefined>)
    return d ? { ...d, wishes: wishes.value } : d
  }

  /** Отметка привычки; day — другой день (например, вечерняя таблетка, отмеченная после полуночи) */
  async function bumpHabit(h: Habit, delta: number, day: string = today.value) {
    const e = await guard(() => repo.bumpHabit(h.id, delta, day)) as HabitEntry | undefined
    if (!e) return false
    if (day !== today.value) return true  // в памяти держим только сегодняшние отметки
    const list = data.value.habitEntries
    const i = list.findIndex(x => x.habit_id === h.id && x.entry_date === today.value)
    if (i >= 0) list[i] = { ...list[i], value: e.value }; else list.push({ habit_id: h.id, entry_date: today.value, value: e.value })
    return true
  }

  // ---------- Календарь цикла ----------
  /** false — в Supabase не выполнен planner_cycle.sql */
  const cycleReady = computed(() => !!data.value.cycle)
  const cycleSettings = computed(() => data.value.cycle?.settings ?? DEFAULT_CYCLE_SETTINGS)
  const cycleCourses = computed(() => [...(data.value.cycle?.courses ?? [])].sort((a, b) => a.starts_on.localeCompare(b.starts_on)))
  const cycleStartList = computed(() => cycleStarts(data.value.cycle?.days ?? []))
  /** Начало текущего (последнего, незаконченного) цикла */
  const currentCycleStart = computed(() => cycleStartList.value.at(-1) ?? null)
  const cycleDayOf = (d: string): CycleDay => data.value.cycle?.days.find(x => x.day === d) ?? { day: d, period: false, cycle_start: false, note: null }
  const cycleNo = (d: string) => cycleDayNo(d, cycleStartList.value)
  const pillCourseOn = (d: string) => courseOn(d, cycleCourses.value)

  async function writeCycleDay(d: CycleDay) {
    const c = data.value.cycle; if (!c) return false
    const ok = await guard(async () => { await repo.setCycleDay(d); return true })
    if (ok) { c.days = c.days.filter(x => x.day !== d.day); if (d.period || d.cycle_start || d.note || d.cycle_note) c.days.push(d) }
    return !!ok
  }
  const setPeriod = (day: string, on: boolean) => writeCycleDay({ ...cycleDayOf(day), period: on })
  const setCycleNote = (day: string, note: string) => writeCycleDay({ ...cycleDayOf(day), note: note.trim() || null })
  /** Примечание ко всему циклу: хранится у его первого дня */
  const setCycleSummary = (start: string, text: string) => writeCycleDay({ ...cycleDayOf(start), cycle_note: text.trim() || null })

  /**
   * Курс цикла, начавшегося в start: по схеме scheme (у переносимого курса — его собственная), иначе по настройкам.
   * Курсы прежних циклов, заходящие на новый цикл, обрезаются накануне его начала. existing — курс, который пересчитываем
   */
  async function placeCourse(start: string, existing?: PillCourse, scheme?: { from_day: number; days: number }) {
    const c = data.value.cycle!
    const next = courseFrom(start, scheme?.from_day ?? cycleSettings.value.course_from_day, scheme?.days ?? cycleSettings.value.course_days)
    return !!(await guard(async () => {
      for (const p of c.courses.filter(p => p.id !== existing?.id && p.kind === 'cycle' && (p.cycle_start ?? '') < start && p.ends_on >= start)) {
        if (p.starts_on >= start) { await repo.removeCourse(p.id); c.courses = c.courses.filter(x => x.id !== p.id) }
        else { const ends_on = addDays(start, -1); await repo.updateCourse(p.id, { ends_on }); p.ends_on = ends_on }
      }
      if (existing) { await repo.updateCourse(existing.id, next); Object.assign(existing, next) }
      else c.courses.push(await repo.addCourse(next))
      return true
    }))
  }
  /** Отметить первый день цикла. Если это начало нового (последнего) цикла — для него создаётся курс таблеток */
  async function markCycleStart(day: string) {
    const latest = currentCycleStart.value
    if (!(await writeCycleDay({ ...cycleDayOf(day), cycle_start: true, period: true }))) return false
    if (!latest || day > latest) { if (!(await placeCourse(day))) return false; return syncPillHabits() }
    return true
  }
  /** Перенести начало текущего цикла на day: курс сдвигается по своей схеме, прошлые отметки приёма не трогаются */
  async function moveCycleStart(day: string) {
    const latest = currentCycleStart.value; const c = data.value.cycle
    if (!latest || !c || day === latest) return false
    const course = c.courses.find(x => x.cycle_start === latest)
    const summary = cycleDayOf(latest).cycle_note ?? null  // примечание к циклу переезжает вместе с началом
    if (!(await writeCycleDay({ ...cycleDayOf(latest), cycle_start: false, cycle_note: null }))) return false
    if (!(await writeCycleDay({ ...cycleDayOf(day), cycle_start: true, period: true, cycle_note: summary }))) return false
    if (!(await placeCourse(day, course, course?.from_day && course.days ? { from_day: course.from_day, days: course.days } : undefined))) return false
    return syncPillHabits()
  }
  /** Снять отметку «первый день»: курс этого цикла удаляется */
  async function unmarkCycleStart(day: string) {
    const c = data.value.cycle; if (!c) return false
    if (!(await writeCycleDay({ ...cycleDayOf(day), cycle_start: false, cycle_note: null }))) return false
    const course = c.courses.find(x => x.cycle_start === day)
    if (course && !(await guard(async () => { await repo.removeCourse(course.id); return true }))) return false
    c.courses = c.courses.filter(x => x.id !== course?.id)
    return syncPillHabits()
  }
  /** Пересчитать курс текущего цикла по нынешним настройкам (например, схему поменяли уже после отметки первого дня) */
  async function recalcCurrentCourse() {
    const latest = currentCycleStart.value; if (!latest) return false
    const course = data.value.cycle?.courses.find(x => x.cycle_start === latest)
    return (await placeCourse(latest, course)) && syncPillHabits()
  }
  /** Сфера таблеток: из настроек, иначе «Здоровье», иначе первая */
  const pillSphereId = () => {
    const id = cycleSettings.value.sphere_id
    return (id && sphereById(id)?.id) || data.value.spheres.find(s => s.name.trim().toLowerCase() === 'здоровье')?.id || data.value.spheres[0]?.id || null
  }
  /**
   * Привычки «Таблетка · утро / вечер»: создаются при первом курсе; окно активности — последний курс,
   * время (для напоминаний) и сфера — из настроек календаря
   */
  async function syncPillHabits() {
    const c = data.value.cycle; const last = cycleCourses.value.at(-1)
    if (!c || !last) return true
    const sphereId = pillSphereId()
    if (!sphereId) { error.value = 'Чтобы таблетки появились в привычках, создай хотя бы одну сферу'; return false }
    const ids: Partial<CycleSettings> = {}
    for (const k of ['morning', 'evening'] as const) {
      const idKey = k === 'morning' ? 'morning_habit_id' : 'evening_habit_id'
      const want = { active_from: last.starts_on, active_until: last.ends_on, remind_at: c.settings[k === 'morning' ? 'morning_time' : 'evening_time'], sphere_id: sphereId }
      const h = data.value.habits.find(x => x.id === c.settings[idKey])
      if (!h) {
        const x = await guard(() => repo.addHabit({ name: PILL_NAMES[k], kind: 'plain', target_value: null, freq: 'day', interval_n: 1, weekdays: [1, 2, 3, 4, 5, 6, 7], mode: 'schedule', starts_on: null, ...want }))
        if (!x) return false
        data.value.habits.push(x); ids[idKey] = x.id
      } else if ((Object.keys(want) as (keyof typeof want)[]).some(key => (h[key] ?? null) !== want[key])) {
        const x = await guard(() => repo.updateHabit(h.id, want)); if (!x) return false
        Object.assign(h, x)
      }
    }
    if (Object.keys(ids).length) {
      if (!(await guard(async () => { await repo.saveCycleSettings(ids); return true }))) return false
      Object.assign(c.settings, ids)
    }
    await reloadQuietly()
    return true
  }
  /** Отметки таблеток за период: какая доза (утро/вечер) и принята ли */
  async function pillMarks(from: string, to: string) {
    const s = cycleSettings.value
    const ids = [s.morning_habit_id, s.evening_habit_id].filter(Boolean) as string[]
    const r = await guard(() => repo.pillEntries(from, to, ids, [PILL_NAMES.morning, PILL_NAMES.evening]))
    return r?.map(e => ({ day: e.entry_date, dose: (e.habit_id === s.morning_habit_id || e.name === PILL_NAMES.morning ? 'morning' : 'evening') as 'morning' | 'evening', taken: e.value >= 1 }))
  }
  const fullTime = (t: string) => (t.length === 5 ? t + ':00' : t)
  async function saveCycleSettings(patch: Partial<CycleSettings>) {
    const c = data.value.cycle; if (!c) return false
    const p = { ...patch }
    if (p.morning_time) p.morning_time = fullTime(p.morning_time)
    if (p.evening_time) p.evening_time = fullTime(p.evening_time)
    const scheme = (p.course_from_day !== undefined && p.course_from_day !== c.settings.course_from_day)
      || (p.course_days !== undefined && p.course_days !== c.settings.course_days)
    if (!(await guard(async () => { await repo.saveCycleSettings(p); return true }))) return false
    Object.assign(c.settings, p)
    // новая схема сразу действует и на текущий (незаконченный) цикл; курсы прошлых циклов не меняются
    if (scheme && currentCycleStart.value) return recalcCurrentCourse()
    return syncPillHabits()  // сфера и время таблеток меняются сразу
  }

  return {
    user, ready, loading, error, data, now, today, spheres, inbox, running, runningSeconds, runningTitle,
    nudgeActive, forgotten, weekMinutes, monthMinutes, taskTotal, sphereById, archivedSpheres, archiveSphere, restoreSphere, projectById, projectsOf, archivedProjectsOf, archiveProject, restoreProject, wishesReady, wishes, activeWishes, fulfilledWishes, wishCategories, addWish, updateWish, removeWish, reorderWishes, wishToTask, colorsReady, hasOwnColors, sphereColors, saveSphereColors, recolorSpheres, moveProject, sphereToProject, addProject, renameProject, removeProject, setTaskSphere, setTaskNoDate, setTaskProject, habitValue, habitIsDone, reorderHabits, reorderSpheres, reorderProjects, addDays,
    staleDays, setStaleDays, deferred, staleDeferred, freshDeferred, snoozeTask,
    tagsReady, budgetReady, orderReady, reorderTasks, subtasksReady, postponesReady, postponeTarget, postponeTask, postponeSheetId, openPostponeSheet, closePostponeSheet, notice, showNotice, syncing, holdReloads, setSubtasks, allTags, renameTag, searchQuery, openSearch, closeSearch,
    cycleReady, cycleSettings, cycleCourses, cycleStartList, currentCycleStart, cycleDayOf, cycleNo, pillCourseOn, setPeriod, setCycleNote, setCycleSummary,
    markCycleStart, moveCycleStart, unmarkCycleStart, recalcCurrentCourse, saveCycleSettings, syncPillHabits, pillMarks, isPillHabit, habitActiveOn, inactiveHabits,
    init, load, refresh, refreshTick, signIn, signUp, signOut, addTask, updateTask, toggleDone, removeTask, addSphere, updateSphere, sphereNameTaken, addHabit, updateHabit, removeHabit, habitDays, habitStatusOf, dueHabits, laterHabits, habitDetailId, openHabit, closeHabit,
    timeBudget, timeBudgetReady, workFor, hasOwnWork, saveTimeBudget, setWeekWork,
    goalFor, reviewFor, currentReview, setWeekGoal, weekData, saveReview, exportAll, savePush, removePush,
    google, googleBusy, googleError, refreshGoogle, syncGoogle, connectGoogle, disconnectGoogle, setGoogleImport, setGoogleSettings, toggleImportCalendar, setExportCalendar,
    startTimer, stopTimer, bumpHabit, addRecurrence, removeRecurrence, habitToTask, taskToHabit, attachRecurrence, updateRecurrence, detachRecurrence,
    detailId, openTask, closeTask, editor, openEditor, closeEditor, longStop, fixLongStop, dismissLongStop, addEntry, updateEntry, removeEntry, listEntries,
  }
})
