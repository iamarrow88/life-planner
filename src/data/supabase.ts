import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Repo, Task, Sphere, Habit, HabitEntry, TimeEntry, User, Recurrence, WeekGoal, WeeklyReview, WeekData, ExportData } from '../types'
import { weekStart as weekStartOf } from '../lib/time'

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

const TASK_COLS = 'id,title,status,sphere_id,due_date,start_time,estimate_minutes,remind_before_minutes,done_at,recurrence_id'
const REC_COLS = 'id,title,sphere_id,start_time,estimate_minutes,remind_before_minutes,freq,interval_n,weekdays,month_day,mode,starts_on,ends_on'
const TE_COLS = 'id,task_id,habit_id,sphere_id,started_at,ended_at,source'

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
    const [spheres, tasks, habits, he, te, recs, goals, reviews] = await Promise.all([
      c.from('spheres').select('id,name,color,weekly_goal_minutes').is('archived_at', null).order('position').order('created_at'),
      c.from('tasks').select(TASK_COLS).order('created_at', { ascending: false }),
      c.from('habits').select('id,name,kind,target_value,sphere_id').is('archived_at', null).order('position').order('created_at'),
      c.from('habit_entries').select('habit_id,entry_date,value').eq('entry_date', today),
      c.from('time_entries').select(TE_COLS).or(`local_date.gte.${since},ended_at.is.null`),
      c.from('recurrences').select(REC_COLS).order('created_at'),
      c.from('sphere_week_goals').select('sphere_id,week_start,minutes').gte('week_start', ws),
      c.from('weekly_reviews').select('week_start,snapshot,went_well,got_in_way,to_change,focus_sphere_id,completed_at').order('week_start', { ascending: false }),
    ])
    return {
      spheres: ok(spheres) as Sphere[], tasks: ok(tasks) as Task[], habits: ok(habits) as Habit[],
      habitEntries: ok(he) as HabitEntry[], timeEntries: ok(te) as TimeEntry[], recurrences: ok(recs) as Recurrence[],
      weekGoals: ok(goals) as WeekGoal[], reviews: ok(reviews) as WeeklyReview[],
    }
  },
  async addTask(t) {
    return ok(await db().from('tasks').insert({
      title: t.title, status: t.status, sphere_id: t.sphere_id ?? null, due_date: t.due_date ?? null,
      start_time: t.start_time ?? null, estimate_minutes: t.estimate_minutes ?? null,
      remind_before_minutes: t.start_time ? (t.remind_before_minutes ?? null) : null,
    }).select(TASK_COLS).single()) as Task
  },
  async updateTask(id, patch) {
    return ok(await db().from('tasks').update(patch).eq('id', id).select(TASK_COLS).single()) as Task
  },
  async removeTask(id) { ok(await db().from('tasks').delete().eq('id', id)) },
  async addSphere(name, color, goal) {
    return ok(await db().from('spheres').insert({ name, color, weekly_goal_minutes: goal })
      .select('id,name,color,weekly_goal_minutes').single()) as Sphere
  },
  async addHabit(h) {
    return ok(await db().from('habits').insert(h).select('id,name,kind,target_value,sphere_id').single()) as Habit
  },
  async startTimer(t) {
    return ok(await db().rpc('start_timer', {
      p_task: t.task_id ?? null, p_habit: t.habit_id ?? null, p_sphere: t.sphere_id ?? null, p_project: null,
    })) as TimeEntry
  },
  async stopTimer() { return (ok(await db().rpc('stop_timer')) as TimeEntry | null) ?? null },
  async addRecurrence(r) {
    ok(await db().from('recurrences').insert({
      title: r.title, sphere_id: r.sphere_id, start_time: r.start_time, estimate_minutes: r.estimate_minutes,
      remind_before_minutes: r.start_time ? (r.remind_before_minutes ?? null) : null,
      freq: r.freq, interval_n: r.interval_n, weekdays: r.freq === 'week' ? r.weekdays : null,
      mode: r.mode, starts_on: r.starts_on,
    }))
    ok(await db().rpc('generate_recurring_tasks'))
  },
  async removeRecurrence(id) { ok(await db().rpc('delete_recurrence', { p_id: id })) },
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
  async exportAll() { return ok(await db().rpc('export_all')) as ExportData },
  async bumpHabit(id, delta, day) {
    return ok(await db().rpc('bump_habit', { p_habit: id, p_delta: delta, p_day: day })) as HabitEntry
  },
}
