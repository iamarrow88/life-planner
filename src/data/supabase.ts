import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { RULE_KEYS, TEMPLATE_KEYS } from '../types'
import type { RecurrencePatch, CaptureInfo, GoogleStatus, Project, Repo, Task, Sphere, Habit, HabitDay, HabitEntry, HabitStatus, TimeEntry, User, Recurrence, WeekGoal, WeeklyReview, WeekData, ExportData } from '../types'
import { todayStr, weekStart as weekStartOf } from '../lib/time'

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

const TASK_COLS = 'id,title,note,status,sphere_id,project_id,due_date,start_time,estimate_minutes,remind_before_minutes,done_at,recurrence_id'
const REC_COLS = 'id,title,note,sphere_id,project_id,start_time,estimate_minutes,remind_before_minutes,freq,interval_n,weekdays,month_day,mode,starts_on,ends_on'
const SPHERE_COLS = 'id,name,color,weekly_goal_minutes,description'
const HABIT_COLS = 'id,name,kind,target_value,sphere_id,created_at,freq,interval_n,mode,weekdays,starts_on'
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
    await c.rpc('generate_recurring_tasks') // создаёт задачи по повторам на 30 дней вперёд (безопасно вызывать повторно)
    const ws = weekStartOf(today)
    const [spheres, archivedSpheres, projects, tasks, habits, he, te, recs, goals, reviews, hs] = await Promise.all([
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
    ])
    return {
      spheres: ok(spheres) as Sphere[], archivedSpheres: ok(archivedSpheres) as Sphere[], projects: ok(projects) as Project[], tasks: ok(tasks) as Task[], habits: ok(habits) as Habit[],
      habitEntries: ok(he) as HabitEntry[], timeEntries: ok(te) as TimeEntry[], recurrences: ok(recs) as Recurrence[],
      weekGoals: ok(goals) as WeekGoal[], reviews: ok(reviews) as WeeklyReview[],
      // если состояние привычек не пришло — считаем, что все запланированы на сегодня (список не должен пропасть)
      habitStatus: hs.error ? [] : (hs.data as HabitStatus[]),
    }
  },
  async addTask(t) {
    return ok(await db().from('tasks').insert({
      title: t.title, note: t.note ?? null, status: t.status, sphere_id: t.sphere_id ?? null, project_id: t.project_id ?? null, due_date: t.due_date ?? null,
      start_time: t.start_time ?? null, estimate_minutes: t.estimate_minutes ?? null,
      remind_before_minutes: t.start_time ? (t.remind_before_minutes ?? null) : null,
    }).select(TASK_COLS).single()) as Task
  },
  async updateTask(id, patch) {
    return ok(await db().from('tasks').update(patch).eq('id', id).select(TASK_COLS).single()) as Task
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
  async reorderHabits(ids) {
    const rs = await Promise.all(ids.map((id, i) => db().from('habits').update({ position: i }).eq('id', id)))
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
    }))
    ok(await db().rpc('generate_recurring_tasks'))
  },
  async removeRecurrence(id) { ok(await db().rpc('delete_recurrence', { p_id: id })) },
  async attachRecurrence(taskId, r) {
    const rec = ok(await db().from('recurrences').insert({
      ...templateOf(r), remind_before_minutes: r.start_time ? (r.remind_before_minutes ?? null) : null,
      freq: r.freq, interval_n: r.interval_n, weekdays: r.weekdays, mode: r.mode, starts_on: r.starts_on,
    }).select('id').single()) as { id: string }
    // задача становится первым разом правила: в тот же день база вторую не создаст (unique по правилу и дате)
    ok(await db().from('tasks').update({ recurrence_id: rec.id }).eq('id', taskId))
    ok(await db().rpc('generate_recurring_tasks'))
  },
  async updateRecurrence(id, patch, keep) {
    const ruleChanged = RULE_KEYS.some(k => k in patch)
    ok(await db().from('recurrences').update({ ...patch, ...(ruleChanged ? { generated_until: null } : {}) }).eq('id', id))
    const tpl = templateOf(patch)
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
