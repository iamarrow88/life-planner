import type { Repo, Snapshot, Task, Sphere, Project, Habit, HabitEntry, TimeEntry, User, Recurrence, EditorTarget, WeekData, ExportData } from '../types'
import { addDays, dayOf, entrySeconds, todayStr } from '../lib/time'
import { matches, nextAfter } from '../lib/recurrence'

const KEY = 'planner-demo-v1'
const uid = () => crypto.randomUUID()
const USER: User = { id: 'demo', email: 'demo@local' }

function seed(): Snapshot {
  const t = todayStr()
  const sp = (name: string, color: string, goal: number): Sphere => ({ id: uid(), name, color, weekly_goal_minutes: goal })
  const spheres = [sp('Здоровье', '#3E8E5F', 300), sp('Хобби', '#7B5CC4', 360), sp('Семья', '#D9783A', 240), sp('Учёба', '#2F6DB3', 420)]
  const [zd, hob, fam, uch] = spheres
  const task = (title: string, p: Partial<Task>): Task => ({
    id: uid(), title, status: 'planned', sphere_id: null, due_date: null, start_time: null,
    estimate_minutes: null, done_at: null, ...p,
  })
  const tasks = [
    task('Купить подарок маме', { status: 'inbox' }),
    task('Идея: собрать плейлист для бега', { status: 'inbox' }),
    task('Записаться к стоматологу', { status: 'inbox' }),
    task('Тренировка', { sphere_id: zd.id, due_date: t, start_time: '08:00:00', estimate_minutes: 45 }),
    task('Повторить главу по Vue', { sphere_id: uch.id, due_date: t, start_time: '19:30:00', estimate_minutes: 60 }),
    task('Позвонить бабушке', { sphere_id: fam.id, due_date: t }),
    task('Схема вышивки: эскиз', { sphere_id: hob.id, due_date: addDays(t, 1), estimate_minutes: 90 }),
  ]
  const habit = (name: string, kind: Habit['kind'], target: number | null, s: Sphere): Habit =>
    ({ id: uid(), name, kind, target_value: target, sphere_id: s.id })
  const habits = [habit('Вода', 'counter', 8, zd), habit('Чтение', 'timer', 20, uch), habit('Растяжка', 'plain', null, zd)]
  const te = (sphere: Sphere, daysAgo: number, min: number): TimeEntry => {
    const end = new Date(); end.setDate(end.getDate() - daysAgo); end.setHours(12, 0, 0, 0)
    return { id: uid(), task_id: null, habit_id: null, sphere_id: sphere.id,
      started_at: new Date(end.getTime() - min * 60000).toISOString(), ended_at: end.toISOString(), source: 'manual' }
  }
  const timeEntries = [te(hob, 0, 75), te(zd, 0, 40), te(uch, 1, 50), te(hob, 1, 60)]
  const pr = (sphere: Sphere, name: string): Project => ({ id: uid(), sphere_id: sphere.id, name })
  const projects = [pr(hob, 'Вышивка'), pr(uch, 'Курс по Vue')]
  return { spheres, projects, tasks, habits, recurrences: [], weekGoals: [], reviews: [], habitEntries: [{ habit_id: habits[0].id, entry_date: t, value: 3 }], timeEntries }
}

/** Итог недели для демо-режима: то же, что week_review_data в базе */
function weekDataFor(s: Snapshot, ws: string): WeekData {
  const we = addDays(ws, 6), today = todayStr()
  const inWeek = (e: TimeEntry, a: string, b: string) => { const d = dayOf(e.started_at); return d >= a && d <= b }
  const sphereMin = (id: string, a: string, b: string) =>
    Math.floor(s.timeEntries.filter(e => e.sphere_id === id && inWeek(e, a, b)).reduce((t, e) => t + entrySeconds(e), 0) / 60)
  const goalOf = (sp: Sphere) => s.weekGoals.find(g => g.sphere_id === sp.id && g.week_start === ws)?.minutes ?? sp.weekly_goal_minutes
  const spheres = s.spheres.map(sp => ({ sphere_id: sp.id, name: sp.name, color: sp.color, minutes: sphereMin(sp.id, ws, we), goal_minutes: goalOf(sp) }))
  const prevTotal = s.spheres.reduce((t, sp) => t + sphereMin(sp.id, addDays(ws, -7), addDays(ws, -1)), 0)
  const tasks = s.tasks.filter(t => t.due_date && t.due_date >= ws && t.due_date <= we && t.status !== 'inbox')

  let habitDone = 0, habitTotal = 0
  const lastDay = we < today ? we : today
  for (let d = ws; d <= lastDay; d = addDays(d, 1)) {
    for (const h of s.habits) {
      habitTotal++
      const target = h.target_value ?? 1
      const value = h.kind === 'timer'
        ? Math.floor(s.timeEntries.filter(e => e.habit_id === h.id && dayOf(e.started_at) === d).reduce((t, e) => t + entrySeconds(e), 0) / 60)
        : s.habitEntries.find(e => e.habit_id === h.id && e.entry_date === d)?.value ?? 0
      if (value >= target) habitDone++
    }
  }
  const perTask = new Map<string, number>()
  for (const e of s.timeEntries) if (e.task_id && inWeek(e, ws, we)) perTask.set(e.task_id, (perTask.get(e.task_id) ?? 0) + entrySeconds(e))
  const top = [...perTask.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).flatMap(([id, sec]) => {
    const t = s.tasks.find(x => x.id === id)
    return t ? [{ task_id: id, title: t.title, sphere_id: t.sphere_id, estimate_minutes: t.estimate_minutes, spent_minutes: Math.floor(sec / 60) }] : []
  })
  return {
    week_start: ws, total_minutes: spheres.reduce((t, x) => t + x.minutes, 0), prev_total_minutes: prevTotal, spheres,
    tasks_done: s.tasks.filter(t => t.status === 'done' && !!t.done_at && dayOf(t.done_at) >= ws && dayOf(t.done_at) <= we).length, tasks_total: tasks.length,
    habit_days_done: habitDone, habit_days_total: habitTotal, top_time_tasks: top,
  }
}

function matchTarget(e: TimeEntry, t: EditorTarget): boolean {
  if (t.task_id) return e.task_id === t.task_id
  if (t.habit_id) return e.habit_id === t.habit_id
  return e.sphere_id === t.sphere_id && !e.task_id && !e.habit_id
}

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const s = JSON.parse(raw) as Snapshot; s.projects ??= []; s.recurrences ??= []; s.weekGoals ??= []; s.reviews ??= []; return s }
  } catch { /* ignore */ }
  const s = seed(); write(s); return s
}
function write(s: Snapshot) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } }

function newFromRule(r: Recurrence, due: string): Task {
  return { id: uid(), title: r.title, status: 'planned', sphere_id: r.sphere_id, due_date: due,
    start_time: r.start_time, estimate_minutes: r.estimate_minutes, remind_before_minutes: r.remind_before_minutes ?? null,
    done_at: null, recurrence_id: r.id }
}

/** Создаёт задачи по правилам на 30 дней вперёд (не дублируя уже созданные) */
function generate(s: Snapshot) {
  const t = todayStr()
  for (const r of s.recurrences) {
    if (r.mode === 'after_completion') continue
    for (let i = 0; i <= 30; i++) {
      const d = addDays(t, i)
      if (matches(r, d) && !s.tasks.some(x => x.recurrence_id === r.id && x.due_date === d)) s.tasks.push(newFromRule(r, d))
    }
  }
}

export const demoRepo: Repo = {
  mode: 'demo',
  async session() { return USER },
  async signIn() { return USER },
  async signUp() { return USER },
  async signOut() { /* в демо выходить некуда */ },
  async load() { const s = read(); generate(s); write(s); return s },
  async addTask(t) {
    const s = read()
    const task: Task = { id: uid(), title: t.title, note: t.note ?? null, status: t.status, sphere_id: t.sphere_id ?? null, project_id: t.project_id ?? null,
      due_date: t.due_date ?? null, start_time: t.start_time ?? null, estimate_minutes: t.estimate_minutes ?? null,
      remind_before_minutes: t.start_time ? (t.remind_before_minutes ?? null) : null, done_at: null }
    s.tasks.unshift(task); write(s); return task
  },
  async updateTask(id, patch) {
    const s = read(); const t = s.tasks.find(x => x.id === id)
    if (!t) throw new Error('Задача не найдена')
    const wasDone = t.status === 'done'
    Object.assign(t, patch)
    // как в базе: сфера задачи с проектом равна сфере проекта; сменили сферу без проекта — проект сбрасывается
    if (t.project_id) {
      const pj = s.projects.find(x => x.id === t.project_id)
      if (!pj) t.project_id = null
      else if ('project_id' in patch) t.sphere_id = pj.sphere_id
      else if (pj.sphere_id !== t.sphere_id) t.project_id = null
    }
    if ('sphere_id' in patch) for (const e of s.timeEntries) if (e.task_id === id) e.sphere_id = t.sphere_id
    t.done_at = t.status === 'done' ? (t.done_at ?? new Date().toISOString()) : null
    // режим «после выполнения»: создаём следующую задачу
    const rec = t.recurrence_id ? s.recurrences.find(r => r.id === t.recurrence_id) : undefined
    if (rec && rec.mode === 'after_completion' && !wasDone && t.status === 'done') {
      const due = nextAfter(rec, todayStr())
      if (!rec.ends_on || due <= rec.ends_on) s.tasks.unshift(newFromRule(rec, due))
    }
    write(s); return t
  },
  async removeTask(id) { const s = read(); s.tasks = s.tasks.filter(t => t.id !== id); write(s) },
  async updateSphere(id, patch) {
    const s = read(); const sp = s.spheres.find(x => x.id === id)
    if (!sp) throw new Error('Сфера не найдена')
    Object.assign(sp, patch); write(s); return { ...sp }
  },
  async addSphere(name, color, goal, description) {
    const s = read(); const sp: Sphere = { id: uid(), name, color, weekly_goal_minutes: goal, description: description?.trim() || null }
    s.spheres.push(sp); write(s); return sp
  },
  async addProject(sphereId, name) {
    const s = read(); const p: Project = { id: uid(), sphere_id: sphereId, name }
    s.projects.push(p); write(s); return p
  },
  async renameProject(id, name) { const s = read(); const p = s.projects.find(x => x.id === id); if (p) p.name = name; write(s) },
  async archiveProject(id) { const s = read(); const p = s.projects.find(x => x.id === id); if (p) p.status = 'archived'; write(s) },
  async restoreProject(id) { const s = read(); const p = s.projects.find(x => x.id === id); if (p) p.status = 'active'; write(s) },
  async removeProject(id) {
    const s = read(); s.projects = s.projects.filter(x => x.id !== id)
    for (const t of s.tasks) if (t.project_id === id) t.project_id = null
    write(s)
  },
  async updateHabit(id, patch) {
    const s = read(); const h = s.habits.find(x => x.id === id)
    if (!h) throw new Error('Привычка не найдена')
    Object.assign(h, patch); write(s); return { ...h }
  },
  async archiveHabit(id) { const s = read(); s.habits = s.habits.filter(h => h.id !== id); write(s) },
  async habitWeek(ws) {
    const s = read(); const we = addDays(ws, 6)
    return {
      entries: s.habitEntries.filter(e => e.entry_date >= ws && e.entry_date <= we),
      timeEntries: s.timeEntries.filter(e => e.habit_id && dayOf(e.started_at) >= addDays(ws, -1) && dayOf(e.started_at) <= addDays(we, 1)),
    }
  },
  async addHabit(h) { const s = read(); const x: Habit = { id: uid(), created_at: new Date().toISOString(), ...h }; s.habits.push(x); write(s); return x },
  async startTimer(target) {
    const s = read()
    const now = new Date().toISOString()
    const running = s.timeEntries.find(e => !e.ended_at)
    if (running) running.ended_at = now
    let sphere = target.sphere_id ?? null
    if (target.task_id) sphere = s.tasks.find(t => t.id === target.task_id)?.sphere_id ?? sphere
    if (target.habit_id) sphere = s.habits.find(h => h.id === target.habit_id)?.sphere_id ?? sphere
    const e: TimeEntry = { id: uid(), task_id: target.task_id ?? null, habit_id: target.habit_id ?? null,
      sphere_id: sphere, started_at: now, ended_at: null, source: 'timer' }
    s.timeEntries.push(e); write(s); return e
  },
  async stopTimer() {
    const s = read(); const e = s.timeEntries.find(x => !x.ended_at)
    if (!e) return null
    e.ended_at = new Date().toISOString(); write(s); return e
  },
  async addRecurrence(r) {
    const s = read()
    const rec: Recurrence = { ...r, id: uid(), month_day: null, ends_on: null }
    s.recurrences.push(rec)
    if (rec.mode === 'after_completion') s.tasks.unshift(newFromRule(rec, rec.starts_on))
    generate(s); write(s)
  },
  async removeRecurrence(id) {
    const s = read(); const t = todayStr()
    s.tasks = s.tasks.filter(x => !(x.recurrence_id === id && x.status !== 'done' && (x.due_date ?? '') >= t))
    s.recurrences = s.recurrences.filter(r => r.id !== id); write(s)
  },
  async listEntries(target: EditorTarget) {
    return read().timeEntries.filter(e => matchTarget(e, target))
      .sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 100)
  },
  async addEntry(target, startedAt, endedAt) {
    const s = read()
    let sphere = target.sphere_id ?? null
    if (target.task_id) sphere = s.tasks.find(t => t.id === target.task_id)?.sphere_id ?? sphere
    if (target.habit_id) sphere = s.habits.find(h => h.id === target.habit_id)?.sphere_id ?? sphere
    s.timeEntries.push({ id: uid(), task_id: target.task_id ?? null, habit_id: target.habit_id ?? null,
      sphere_id: sphere, started_at: startedAt, ended_at: endedAt, source: 'manual' })
    write(s)
  },
  async updateEntry(id, startedAt, endedAt) {
    const s = read(); const e = s.timeEntries.find(x => x.id === id)
    if (!e) throw new Error('Запись не найдена')
    e.started_at = startedAt; e.ended_at = endedAt; write(s)
  },
  async removeEntry(id) { const s = read(); s.timeEntries = s.timeEntries.filter(e => e.id !== id); write(s) },
  async weekData(weekStart) { return weekDataFor(read(), weekStart) },
  async setWeekGoal(sphereId, weekStart, minutes, makeDefault) {
    const s = read(); const sp = s.spheres.find(x => x.id === sphereId)
    if (!sp) throw new Error('Сфера не найдена')
    if (makeDefault) {
      sp.weekly_goal_minutes = minutes
      s.weekGoals = s.weekGoals.filter(g => !(g.sphere_id === sphereId && g.week_start >= weekStart))
    } else {
      const g = s.weekGoals.find(x => x.sphere_id === sphereId && x.week_start === weekStart)
      if (g) g.minutes = minutes; else s.weekGoals.push({ sphere_id: sphereId, week_start: weekStart, minutes })
    }
    write(s)
  },
  async saveReview(weekStart, input, snapshot, complete) {
    const s = read()
    let r = s.reviews.find(x => x.week_start === weekStart)
    if (!r) { r = { week_start: weekStart, snapshot: {}, went_well: null, got_in_way: null, to_change: null, focus_sphere_id: null, completed_at: null }; s.reviews.unshift(r) }
    r.went_well = input.went_well || null; r.got_in_way = input.got_in_way || null; r.to_change = input.to_change || null
    r.focus_sphere_id = input.focus_sphere_id
    if (snapshot) r.snapshot = snapshot
    if (complete) r.completed_at = new Date().toISOString()
    write(s)
  },
  async savePushSubscription() { throw new Error('Уведомления работают после подключения Supabase') },
  async removePushSubscription() { /* в демо нечего удалять */ },
  async googleStatus() { return { configured: false, connected: false, email: null, import_events: true, last_sync_at: null, last_error: null } },
  async googleConnect(): Promise<never> { throw new Error('Синхронизация с Google работает только при подключении Supabase') },
  async googleDisconnect(): Promise<never> { throw new Error('Синхронизация с Google работает только при подключении Supabase') },
  async googleSettings(): Promise<never> { throw new Error('Синхронизация с Google работает только при подключении Supabase') },
  async googleSync(): Promise<never> { throw new Error('Синхронизация с Google работает только при подключении Supabase') },
  async exportAll(): Promise<ExportData> {
    const s = read()
    return {
      version: 1, exported_at: new Date().toISOString(),
      spheres: s.spheres, projects: s.projects, tasks: s.tasks, recurrences: s.recurrences, habits: s.habits,
      habit_entries: s.habitEntries,
      time_entries: s.timeEntries.map(e => ({ ...e, local_date: dayOf(e.started_at), duration_seconds: e.ended_at ? entrySeconds(e) : null })),
      week_goals: s.weekGoals, weekly_reviews: s.reviews,
    }
  },
  async bumpHabit(id, delta, day): Promise<HabitEntry> {
    const s = read(); const h = s.habits.find(x => x.id === id)
    if (!h) throw new Error('Привычка не найдена')
    let e = s.habitEntries.find(x => x.habit_id === id && x.entry_date === day)
    if (!e) { e = { habit_id: id, entry_date: day, value: 0 }; s.habitEntries.push(e) }
    const cap = h.kind === 'plain' ? 1 : (h.target_value ?? 1)
    e.value = Math.min(cap, Math.max(0, e.value + delta))
    write(s); return e
  },
}
