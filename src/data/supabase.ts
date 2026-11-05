import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { RULE_KEYS, TEMPLATE_KEYS } from '../types'
import type { CycleDay, CycleSettings, PillCourse, PillEntry, TimeBudget, WeekWork, RecurrencePatch, CaptureInfo, GoogleStatus, Project, Repo, Task, Sphere, Habit, HabitDay, HabitEntry, HabitStatus, TimeEntry, User, Recurrence, WeekGoal, WeeklyReview, WeekData, ExportData, Wish, Book, MonthlyItem } from '../types'
import { entrySeconds, todayStr, weekStart as weekStartOf } from '../lib/time'
import { DEFAULT_CYCLE_SETTINGS } from '../lib/cycle'

const env = import.meta.env as Record<string, string | undefined>
const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, '') || undefined
// anon key в новых проектах Supabase называется «publishable key» — принимаем оба названия
const url = clean(env.VITE_SUPABASE_URL)
const key = clean(env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_KEY)

/** Чего не хватает для подключения — показываем в демо-режиме */
export const supabaseProblems: string[] = []
if (!url) supabaseProblems.push('VITE_SUPABASE_URL не найден или пустой')
else if (!/^https?:\/\//.test(url)) supabaseProblems.push('VITE_SUPABASE_URL должен начинаться с https://')
if (!key) supabaseProblems.push('VITE_SUPABASE_ANON_KEY не найден или пустой')
export const supabaseConfigured = supabaseProblems.length === 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sb: SupabaseClient<any, any, any> | null = null
try { if (supabaseConfigured) sb = createClient(url!, key!) } catch (e) {
  supabaseProblems.push('Не удалось создать клиент: ' + (e as Error).message)
}
const db = () => { if (!sb) throw new Error('Supabase не настроен'); return sb }
function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}
const toUser = (u: { id: string; email?: string | null } | null | undefined): User | null =>
  u ? { id: u.id, email: u.email ?? '' } : null

/** Адрес функции быстрого ввода (для приложения на часах) */
export const captureUrl = url ? url.replace(/\/+$/, '') + '/functions/v1/capture' : ''

/** Вызов Edge Function google-sync; понятные тексты вместо технических ошибок */
async function callGoogle(body: Record<string, unknown>): Promise<GoogleStatus> {
  const r = await db().functions.invoke('google-sync', { body })
  if (r.error) {
    let msg = r.error.message
    const ctx = (r.error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      if (ctx.status === 404) msg = 'Функция google-sync не загружена на сервер. Смотри GOOGLE.md, шаг 4.'
      else try { const j = await ctx.json() as { error?: string; message?: string }; msg = j.error ?? j.message ?? msg } catch { /* оставляем исходный текст */ }
    } else if (/Failed to send a request/i.test(msg)) msg = 'Не удалось связаться с функцией google-sync. Проверь, что она загружена (GOOGLE.md, шаг 4).'
    throw new Error(msg)
  }
  return r.data as GoogleStatus
}

const TASK_BASE_COLS = 'id,title,note,status,sphere_id,project_id,due_date,start_time,estimate_minutes,remind_before_minutes,done_at,recurrence_id,updated_at'
const REC_BASE_COLS = 'id,title,note,sphere_id,project_id,start_time,estimate_minutes,remind_before_minutes,freq,interval_n,weekdays,month_day,mode,starts_on,ends_on'
// Необязательные колонки задач и повторов: их добавляют отдельные SQL-патчи (planner_tags.sql, planner_budget.sql, planner_task_order.sql, planner_subtasks.sql).
// Пока патч не выполнен, колонку не читаем и не пишем — приложение работает без неё
const optional = { tags: true, budget: true, position: true, subtasks: true, postpones: true, priority: true }
type Opt = keyof typeof optional
const OPTS = Object.keys(optional) as Opt[]
/** position есть только у задач */
const REC_OPTS: Opt[] = ['tags', 'budget', 'subtasks']
const optCols = (keys: Opt[]) => keys.filter(k => optional[k]).map(k => ',' + k).join('')
let TASK_COLS = TASK_BASE_COLS + optCols(OPTS)
let REC_COLS = REC_BASE_COLS + optCols(REC_OPTS)
function dropOpt(k: Opt) { optional[k] = false; TASK_COLS = TASK_BASE_COLS + optCols(OPTS); REC_COLS = REC_BASE_COLS + optCols(REC_OPTS) }
/** Убрать из записи поля колонок, которых в базе нет (иначе запрос упадёт) */
const withOpt = <T extends object>(o: T): T => { const r = { ...o } as Record<string, unknown>; for (const k of OPTS) if (!optional[k]) delete r[k]; return r as T }
/** Необязательные поля новой записи: только заданные и только если колонка есть */
const optFields = (o: { tags?: string[]; budget?: number | null; subtasks?: unknown[] }) => ({
  ...(optional.subtasks && o.subtasks?.length ? { subtasks: o.subtasks } : {}),
  ...(optional.tags && o.tags?.length ? { tags: o.tags } : {}),
  ...(optional.budget && o.budget != null ? { budget: o.budget } : {}),
})
const SPHERE_COLS = 'id,name,color,weekly_goal_minutes,description'
const HABIT_BASE_COLS = 'id,name,kind,target_value,sphere_id,created_at,freq,interval_n,mode,weekdays,starts_on,remind_at'
// окно активности добавляет planner_cycle.sql: пока его не выполнили, читаем привычки без этих полей
let HABIT_COLS = HABIT_BASE_COLS + ',active_from,active_until'
const CYCLE_SETTINGS_COLS = 'link_label,sphere_id,course_from_day,course_days,morning_time,evening_time,morning_habit_id,evening_habit_id'
const CYCLE_DAY_BASE = 'day,period,cycle_start,note'
let cycleDayCols = CYCLE_DAY_BASE + ',cycle_note'
const COURSE_COLS = 'id,kind,cycle_start,from_day,days,starts_on,ends_on'
const TE_COLS = 'id,task_id,habit_id,sphere_id,started_at,ended_at,source'

/** Поля шаблона правила в виде записи задачи */
const templateOf = (r: RecurrencePatch) =>
  Object.fromEntries(TEMPLATE_KEYS.filter(k => k in r).map(k => [k, r[k] ?? null])) as Partial<Task>
/** Убрать будущие невыполненные задачи правила (кроме keep и тех, где уже записано время) — как rebuild_recurrence в базе */
async function dropFuture(recId: string, keep?: string) {
  let q = db().from('tasks').select('id').eq('recurrence_id', recId).neq('status', 'done').gte('due_date', todayStr())
  if (keep) q = q.neq('id', keep)
  const ids = (ok(await q) as { id: string }[]).map(x => x.id)
  if (!ids.length) return
  const withTime = new Set((ok(await db().from('time_entries').select('task_id').in('task_id', ids)) as { task_id: string }[]).map(x => x.task_id))
  const drop = ids.filter(id => !withTime.has(id))
  if (drop.length) ok(await db().from('tasks').delete().in('id', drop))
}

/** День, когда это устройство последний раз запускало generate_recurring_tasks */
const GEN_DAY_KEY = 'kola-recurring-generated'
const MONTHLY_COLS = 'id,title,note,position,done_month,task_id,task_month,created_at'
const BOOK_COLS = 'id,title,author,status,position,total_pages,current_page,started_on,finished_on,rating,notes,created_at'
const WISH_COLS = 'id,title,note,url,price,category,position,fulfilled_at,task_id,created_at'

export const supabaseRepo: Repo = {
  mode: 'supabase',
  async session() { return toUser((await db().auth.getSession()).data.session?.user) },
  async signIn(email, password) {
    const r = await db().auth.signInWithPassword({ email, password })
    if (r.error) throw new Error(r.error.message)
    return toUser(r.data.user)!
  },
  async signUp(email, password) {
    const r = await db().auth.signUp({ email, password })
    if (r.error) throw new Error(r.error.message)
    return r.data.session ? toUser(r.data.user) : null // null — нужно подтвердить почту
  },
  async signOut() { await db().auth.signOut() },

  async load(today, since) {
    const c = db()
    // Задачи по повторам создаются на 30 дней вперёд, поэтому достаточно раз в день на устройстве (правка повтора и
    // «после выполнения» создают их сами). Первый запуск дня ждёт генерацию, остальные загрузки — нет
    let genDay: string | null = null
    try { genDay = localStorage.getItem(GEN_DAY_KEY) } catch { /* без хранилища — генерируем каждый раз */ }
    if (genDay !== today) {
      const g = await c.rpc('generate_recurring_tasks')
      if (!g.error) try { localStorage.setItem(GEN_DAY_KEY, today) } catch { /* см. выше */ }
    }
    const ws = weekStartOf(today)
    /** Время по задачам за всё, что старше since. Без него приложение работает: факт будет только за загруженный период */
    const olderTaskSeconds = async () => {
      const res: Record<string, number> = {}
      const PAGE = 1000 // больше за один запрос Supabase не отдаёт
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await c.from('time_entries').select('task_id,started_at,ended_at')
          .not('task_id', 'is', null).not('ended_at', 'is', null).lt('local_date', since)
          .order('started_at').order('id').range(from, from + PAGE - 1)
        if (error) return res
        for (const e of data as { task_id: string; started_at: string; ended_at: string }[]) res[e.task_id] = (res[e.task_id] ?? 0) + entrySeconds(e)
        if (data.length < PAGE) return res
      }
    }
    const [taskSecondsBefore, spheres, archivedSpheres, projects, tasksRes, habitsRes, he, te, recsRes, goals, reviews, hs, budget, work, colorsRes, wishesRes, booksRes, monthlyRes, cDays, cSet, cCourses] = await Promise.all([
      olderTaskSeconds(),
      c.from('spheres').select(SPHERE_COLS).is('archived_at', null).order('position').order('created_at'),
      c.from('spheres').select(SPHERE_COLS).not('archived_at', 'is', null).order('archived_at', { ascending: false }),
      c.from('projects').select('id,sphere_id,name,status').order('position').order('created_at'),
      c.from('tasks').select(TASK_COLS).order('created_at', { ascending: false }),
      c.from('habits').select(HABIT_COLS).is('archived_at', null).order('position').order('created_at'),
      c.from('habit_entries').select('habit_id,entry_date,value').eq('entry_date', today),
      c.from('time_entries').select(TE_COLS).or(`local_date.gte.${since},ended_at.is.null`),
      c.from('recurrences').select(REC_COLS).order('created_at'),
      c.from('sphere_week_goals').select('sphere_id,week_start,minutes').gte('week_start', ws),
      c.from('weekly_reviews').select('week_start,snapshot,went_well,got_in_way,to_change,focus_sphere_id,completed_at').order('week_start', { ascending: false }),
      c.rpc('habit_status', { p_day: today }),
      c.from('user_settings').select('sleep_minutes_per_day,routine_minutes_per_day').maybeSingle(),
      c.from('week_work').select('week_start,minutes').order('week_start'),
      // отдельным запросом: пока planner_sphere_colors.sql не выполнен, остальные настройки должны читаться
      c.from('user_settings').select('sphere_colors').maybeSingle(),
      // желания — тоже отдельный патч базы (planner_wishes.sql)
      c.from('wishes').select(WISH_COLS).order('position').order('created_at', { ascending: false }),
      // библиотека — тоже отдельный патч базы (planner_books.sql)
      c.from('books').select(BOOK_COLS).order('position').order('created_at'),
      // ежемесячный чек-лист — тоже отдельный патч базы (planner_monthly.sql)
      c.from('monthly_items').select(MONTHLY_COLS).order('position').order('created_at'),
      c.from('cycle_days').select(cycleDayCols).order('day'),
      c.from('cycle_settings').select(CYCLE_SETTINGS_COLS).maybeSingle(),
      c.from('pill_courses').select(COURSE_COLS).order('starts_on'),
    ])
    let tasks = tasksRes, recs = recsRes
    for (let i = 0; i < OPTS.length; i++) {
      const missing = OPTS.filter(k => optional[k] && [tasks.error, recs.error].some(e => e?.message.includes(k)))
      if (!missing.length) break
      missing.forEach(dropOpt)
      ;[tasks, recs] = await Promise.all([
        c.from('tasks').select(TASK_COLS).order('created_at', { ascending: false }),
        c.from('recurrences').select(REC_COLS).order('created_at'),
      ])
    }
    let habits = habitsRes
    if (habits.error && HABIT_COLS !== HABIT_BASE_COLS) {
      HABIT_COLS = HABIT_BASE_COLS
      habits = await c.from('habits').select(HABIT_COLS).is('archived_at', null).order('position').order('created_at')
    }
    let cycleDays = cDays
    if (cDays.error && cycleDayCols !== CYCLE_DAY_BASE) {
      // примечание к циклу добавлено в planner_cycle.sql позже: пока его не перевыполнили, читаем без него
      cycleDayCols = CYCLE_DAY_BASE
      cycleDays = await c.from('cycle_days').select(cycleDayCols).order('day')
    }
    const cycleReady = !cycleDays.error && !cSet.error && !cCourses.error
    return {
      spheres: ok(spheres) as Sphere[], archivedSpheres: ok(archivedSpheres) as Sphere[], projects: ok(projects) as Project[], tasks: ok(tasks) as unknown as Task[], habits: ok(habits) as unknown as Habit[],
      habitEntries: ok(he) as HabitEntry[], timeEntries: ok(te) as TimeEntry[], taskSecondsBefore, recurrences: ok(recs) as unknown as Recurrence[],
      tagsReady: optional.tags, budgetReady: optional.budget, orderReady: optional.position, subtasksReady: optional.subtasks, postponesReady: optional.postpones, priorityReady: optional.priority,
      weekGoals: ok(goals) as WeekGoal[], reviews: ok(reviews) as WeeklyReview[],
      // если состояние привычек не пришло — считаем, что все запланированы на сегодня (список не должен пропасть)
      habitStatus: hs.error ? [] : (hs.data as HabitStatus[]),
      // бюджет времени — отдельный патч базы: если его ещё не выполнили, экран просто подскажет это
      timeBudget: budget.error || work.error ? null : ((budget.data as TimeBudget | null) ?? { sleep_minutes_per_day: 480, routine_minutes_per_day: 180 }),
      weekWork: work.error ? [] : (work.data as WeekWork[]),
      monthlyReady: !monthlyRes.error,
      monthlyItems: monthlyRes.error ? [] : (monthlyRes.data as unknown as MonthlyItem[]),
      booksReady: !booksRes.error,
      books: booksRes.error ? [] : (booksRes.data as unknown as Book[]),
      wishesReady: !wishesRes.error,
      wishes: wishesRes.error ? [] : (wishesRes.data as unknown as Wish[]),
      colorsReady: !colorsRes.error,
      sphereColors: colorsRes.error ? null : ((colorsRes.data as { sphere_colors: string[] | null } | null)?.sphere_colors ?? null),
      // календарь цикла — тоже отдельный патч (planner_cycle.sql)
      cycle: cycleReady ? {
        days: cycleDays.data as unknown as CycleDay[],
        settings: { ...DEFAULT_CYCLE_SETTINGS, ...((cSet.data as CycleSettings | null) ?? {}) },
        courses: cCourses.data as PillCourse[],
      } : null,
    }
  },
  async addTask(t) {
    return ok(await db().from('tasks').insert({
      title: t.title, note: t.note ?? null, status: t.status, sphere_id: t.sphere_id ?? null, project_id: t.project_id ?? null, due_date: t.due_date ?? null,
      start_time: t.start_time ?? null, estimate_minutes: t.estimate_minutes ?? null,
      remind_before_minutes: t.start_time ? (t.remind_before_minutes ?? null) : null,
      ...optFields(t),
    }).select(TASK_COLS).single()) as unknown as Task
  },
  async updateTask(id, patch) {
    return ok(await db().from('tasks').update(withOpt(patch)).eq('id', id).select(TASK_COLS).single()) as unknown as Task
  },
  async removeTask(id) { ok(await db().from('tasks').delete().eq('id', id)) },
  async addSphere(name, color, goal, description) {
    return ok(await db().from('spheres').insert({ name, color, weekly_goal_minutes: goal, description: description?.trim() || null })
      .select(SPHERE_COLS).single()) as Sphere
  },
  async updateSphere(id, patch) {
    return ok(await db().from('spheres').update(patch).eq('id', id).select(SPHERE_COLS).single()) as Sphere
  },
  async addProject(sphereId, name) {
    return ok(await db().from('projects').insert({ sphere_id: sphereId, name }).select('id,sphere_id,name,status').single()) as Project
  },
  async renameProject(id, name) { ok(await db().from('projects').update({ name }).eq('id', id)) },
  async moveProject(id, sphereId) { ok(await db().from('projects').update({ sphere_id: sphereId }).eq('id', id)) },
  async sphereToProject(id, targetId) {
    const r = await db().rpc('sphere_to_project', { p_sphere: id, p_target: targetId })
    if (r.error && (r.error.code === 'PGRST202' || r.error.message.includes('sphere_to_project')))
      throw new Error('Чтобы сделать сферу проектом, выполни planner_sphere_to_project.sql в Supabase (SQL Editor)')
    return ok(r) as unknown as string
  },
  async archiveProject(id) { ok(await db().from('projects').update({ status: 'archived' }).eq('id', id)) },
  async restoreProject(id) { ok(await db().from('projects').update({ status: 'active' }).eq('id', id)) },
  async removeProject(id) { ok(await db().from('projects').delete().eq('id', id)) },
  async addHabit(h) {
    // новая привычка — в конец списка: position = максимальный + 1
    const last = ok(await db().from('habits').select('position').is('archived_at', null).order('position', { ascending: false }).limit(1)) as { position: number }[]
    return ok(await db().from('habits').insert({ ...h, position: (last[0]?.position ?? -1) + 1 }).select(HABIT_COLS).single()) as Habit
  },
  async updateHabit(id, patch) {
    return ok(await db().from('habits').update(patch).eq('id', id).select(HABIT_COLS).single()) as Habit
  },
  async archiveSphere(id) { ok(await db().from('spheres').update({ archived_at: new Date().toISOString() }).eq('id', id)) },
  async restoreSphere(id, newName) { ok(await db().from('spheres').update({ archived_at: null, ...(newName ? { name: newName } : {}) }).eq('id', id)) },
  // project_id сбрасываем: у привычки/правила с проектом сфера всегда равна сфере проекта, и смена одной сферы не сработала бы
  async moveHabit(id, sphereId) { ok(await db().from('habits').update({ sphere_id: sphereId, project_id: null }).eq('id', id)) },
  async moveRecurrence(id, sphereId) { ok(await db().from('recurrences').update({ sphere_id: sphereId, project_id: null }).eq('id', id)) },
  async reorderTasks(ids) {
    if (!optional.position) throw new Error('Чтобы менять порядок задач, выполни planner_task_order.sql в Supabase (SQL Editor)')
    const rs = await Promise.all(ids.map((id, i) => db().from('tasks').update({ position: i }).eq('id', id)))
    for (const r of rs) if (r.error) throw new Error(r.error.message)
  },
  async reorderHabits(ids) {
    const rs = await Promise.all(ids.map((id, i) => db().from('habits').update({ position: i }).eq('id', id)))
    for (const r of rs) if (r.error) throw new Error(r.error.message)
  },
  async reorderSpheres(ids) {
    const rs = await Promise.all(ids.map((id, i) => db().from('spheres').update({ position: i }).eq('id', id)))
    for (const r of rs) if (r.error) throw new Error(r.error.message)
  },
  async reorderProjects(ids) {
    const rs = await Promise.all(ids.map((id, i) => db().from('projects').update({ position: i }).eq('id', id)))
    for (const r of rs) if (r.error) throw new Error(r.error.message)
  },
  async archiveHabit(id) { ok(await db().from('habits').update({ archived_at: new Date().toISOString() }).eq('id', id)) },
  async habitDays(from, to) { return ok(await db().rpc('habit_days', { p_from: from, p_to: to })) as HabitDay[] },
  async habitStatus(day) { return ok(await db().rpc('habit_status', { p_day: day })) as HabitStatus[] },
  async startTimer(t) {
    return ok(await db().rpc('start_timer', {
      p_task: t.task_id ?? null, p_habit: t.habit_id ?? null, p_sphere: t.sphere_id ?? null, p_project: null,
    })) as TimeEntry
  },
  async stopTimer() { return (ok(await db().rpc('stop_timer')) as TimeEntry | null) ?? null },
  async addRecurrence(r) {
    ok(await db().from('recurrences').insert({
      title: r.title, note: r.note ?? null, sphere_id: r.sphere_id, project_id: r.project_id ?? null, start_time: r.start_time, estimate_minutes: r.estimate_minutes,
      remind_before_minutes: r.start_time ? (r.remind_before_minutes ?? null) : null,
      freq: r.freq, interval_n: r.interval_n, weekdays: r.freq === 'week' ? r.weekdays : null,
      mode: r.mode, starts_on: r.starts_on,
      ...optFields(r),
    }))
    ok(await db().rpc('generate_recurring_tasks'))
  },
  async addMonthlyItem(i) { return ok(await db().from('monthly_items').insert(i).select(MONTHLY_COLS).single()) as unknown as MonthlyItem },
  async updateMonthlyItem(id, patch) { return ok(await db().from('monthly_items').update(patch).eq('id', id).select(MONTHLY_COLS).single()) as unknown as MonthlyItem },
  async removeMonthlyItem(id) { ok(await db().from('monthly_items').delete().eq('id', id)) },
  async reorderMonthlyItems(ids) {
    const rs = await Promise.all(ids.map((id, i) => db().from('monthly_items').update({ position: i }).eq('id', id)))
    for (const r of rs) if (r.error) throw new Error(r.error.message)
  },
  async addBook(b) { return ok(await db().from('books').insert(b).select(BOOK_COLS).single()) as unknown as Book },
  async updateBook(id, patch) { return ok(await db().from('books').update(patch).eq('id', id).select(BOOK_COLS).single()) as unknown as Book },
  async removeBook(id) { ok(await db().from('books').delete().eq('id', id)) },
  async reorderBooks(ids) {
    const rs = await Promise.all(ids.map((id, i) => db().from('books').update({ position: i }).eq('id', id)))
    for (const r of rs) if (r.error) throw new Error(r.error.message)
  },
  async addWish(w) { return ok(await db().from('wishes').insert(w).select(WISH_COLS).single()) as unknown as Wish },
  async updateWish(id, patch) { return ok(await db().from('wishes').update(patch).eq('id', id).select(WISH_COLS).single()) as unknown as Wish },
  async removeWish(id) { ok(await db().from('wishes').delete().eq('id', id)) },
  async reorderWishes(ids) {
    const rs = await Promise.all(ids.map((id, i) => db().from('wishes').update({ position: i }).eq('id', id)))
    for (const r of rs) if (r.error) throw new Error(r.error.message)
  },
  async saveSphereColors(colors) {
    const uid = (await db().auth.getSession()).data.session?.user.id
    if (!uid) throw new Error('Нужно войти')
    ok(await db().from('user_settings').upsert({ user_id: uid, sphere_colors: colors }))
  },
  async saveTimeBudget(patch) {
    const uid = (await db().auth.getSession()).data.session?.user.id
    if (!uid) throw new Error('Нужно войти')
    ok(await db().from('user_settings').upsert({ user_id: uid, ...patch }))
  },
  async setWeekWork(weekStart, minutes) {
    ok(await db().from('week_work').upsert({ week_start: weekStart, minutes }, { onConflict: 'user_id,week_start' }))
  },
  async renameTag(from, to) {
    if (!optional.tags) throw new Error('Чтобы пользоваться тегами, выполни planner_tags.sql в Supabase (SQL Editor)')
    ok(await db().rpc('rename_tag', { p_old: from, p_new: to }))
  },
  async setCycleDay(d) {
    if (d.cycle_note && cycleDayCols === CYCLE_DAY_BASE) throw new Error('Чтобы сохранять примечание к циклу, ещё раз выполни planner_cycle.sql в Supabase (SQL Editor)')
    if (d.period || d.cycle_start || d.note || d.cycle_note) ok(await db().from('cycle_days').upsert({
      day: d.day, period: d.period, cycle_start: d.cycle_start, note: d.note || null,
      ...(cycleDayCols !== CYCLE_DAY_BASE ? { cycle_note: d.cycle_note || null } : {}),
    }, { onConflict: 'user_id,day' }))
    else ok(await db().from('cycle_days').delete().eq('day', d.day))
  },
  async saveCycleSettings(patch) { ok(await db().from('cycle_settings').upsert(patch, { onConflict: 'user_id' })) },
  async addCourse(c) { return ok(await db().from('pill_courses').insert(c).select(COURSE_COLS).single()) as PillCourse },
  async updateCourse(id, patch) { ok(await db().from('pill_courses').update(patch).eq('id', id)) },
  async pillEntries(from, to, ids, names) {
    // архивные (удалённые) привычки тоже: их отметки остаются в истории
    const [byName, byId] = await Promise.all([
      db().from('habits').select('id,name').in('name', names),
      ids.length ? db().from('habits').select('id,name').in('id', ids) : Promise.resolve({ data: [], error: null }),
    ])
    const hs = new Map([...(ok(byName) as { id: string; name: string }[]), ...(ok(byId) as { id: string; name: string }[])].map(h => [h.id, h.name]))
    if (!hs.size) return []
    const es = ok(await db().from('habit_entries').select('habit_id,entry_date,value').in('habit_id', [...hs.keys()])
      .gte('entry_date', from).lte('entry_date', to)) as Omit<PillEntry, 'name'>[]
    return es.map(e => ({ ...e, name: hs.get(e.habit_id)! }))
  },
  async removeCourse(id) { ok(await db().from('pill_courses').delete().eq('id', id)) },
  async removeRecurrence(id) { ok(await db().rpc('delete_recurrence', { p_id: id })) },
  async attachRecurrence(taskId, r) {
    const rec = ok(await db().from('recurrences').insert({
      ...withOpt(templateOf(r)), remind_before_minutes: r.start_time ? (r.remind_before_minutes ?? null) : null,
      freq: r.freq, interval_n: r.interval_n, weekdays: r.weekdays, mode: r.mode, starts_on: r.starts_on,
    }).select('id').single()) as { id: string }
    // задача становится первым разом правила: в тот же день база вторую не создаст (unique по правилу и дате)
    ok(await db().from('tasks').update({ recurrence_id: rec.id }).eq('id', taskId))
    ok(await db().rpc('generate_recurring_tasks'))
  },
  async updateRecurrence(id, patch, keep) {
    const ruleChanged = RULE_KEYS.some(k => k in patch)
    ok(await db().from('recurrences').update(withOpt({ ...patch, ...(ruleChanged ? { generated_until: null } : {}) })).eq('id', id))
    const tpl = withOpt(templateOf(patch))
    if (Object.keys(tpl).length) {
      let q = db().from('tasks').update(tpl).eq('recurrence_id', id).neq('status', 'done').gte('due_date', todayStr())
      if (keep) q = q.neq('id', keep)
      ok(await q)
    }
    if (ruleChanged) { await dropFuture(id, keep); ok(await db().rpc('generate_recurring_tasks')) }
  },
  async detachRecurrence(id, keep) {
    await dropFuture(id, keep)
    ok(await db().from('tasks').update({ recurrence_id: null }).eq('id', keep))
    ok(await db().from('recurrences').delete().eq('id', id))  // у оставшихся (выполненных) задач связь обнулится сама
  },
  async listEntries(t) {
    let q = db().from('time_entries').select(TE_COLS).order('started_at', { ascending: false }).limit(100)
    if (t.task_id) q = q.eq('task_id', t.task_id)
    else if (t.habit_id) q = q.eq('habit_id', t.habit_id)
    else q = q.eq('sphere_id', t.sphere_id!).is('task_id', null).is('habit_id', null)
    return ok(await q) as TimeEntry[]
  },
  async addEntry(t, startedAt, endedAt) {
    ok(await db().from('time_entries').insert({
      task_id: t.task_id ?? null, habit_id: t.habit_id ?? null,
      sphere_id: t.task_id || t.habit_id ? null : t.sphere_id ?? null,
      started_at: startedAt, ended_at: endedAt, source: 'manual',
    }))
  },
  async updateEntry(id, startedAt, endedAt) {
    ok(await db().from('time_entries').update({ started_at: startedAt, ended_at: endedAt }).eq('id', id))
  },
  async removeEntry(id) { ok(await db().from('time_entries').delete().eq('id', id)) },
  async weekData(weekStart) { return ok(await db().rpc('week_review_data', { p_week_start: weekStart })) as WeekData },
  async setWeekGoal(sphereId, weekStart, minutes, makeDefault) {
    ok(await db().rpc('set_week_goal', { p_sphere: sphereId, p_week_start: weekStart, p_minutes: minutes, p_make_default: makeDefault }))
  },
  async saveReview(weekStart, input, snapshot, complete) {
    ok(await db().from('weekly_reviews').upsert({
      week_start: weekStart, went_well: input.went_well || null, got_in_way: input.got_in_way || null,
      to_change: input.to_change || null, focus_sphere_id: input.focus_sphere_id,
      ...(snapshot ? { snapshot } : {}), ...(complete ? { completed_at: new Date().toISOString() } : {}),
    }, { onConflict: 'user_id,week_start' }))
  },
  async savePushSubscription(sub) {
    // одна подписка на устройство: endpoint уникален. Если запись есть — обновляем ключи.
    ok(await db().from('push_subscriptions').upsert(sub, { onConflict: 'endpoint' }))
  },
  async removePushSubscription(endpoint) { ok(await db().from('push_subscriptions').delete().eq('endpoint', endpoint)) },
  googleStatus: () => callGoogle({ action: 'status' }),
  googleConnect: (code, redirectUri) => callGoogle({ action: 'connect', code, redirect_uri: redirectUri }),
  googleDisconnect: () => callGoogle({ action: 'disconnect' }),
  googleSettings: patch => callGoogle({ action: 'settings', ...patch }),
  googleSync: () => callGoogle({ action: 'sync' }),
  async captureInfo() { return ok(await db().rpc('capture_token_info')) as CaptureInfo | null },
  async captureCreate() { return ok(await db().rpc('create_capture_token')) as string },
  async captureRevoke() { ok(await db().rpc('revoke_capture_token')) },
  async exportAll() { return ok(await db().rpc('export_all')) as ExportData },
  async bumpHabit(id, delta, day) {
    return ok(await db().rpc('bump_habit', { p_habit: id, p_delta: delta, p_day: day })) as HabitEntry
  },
}
