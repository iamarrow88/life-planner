export type TaskStatus = 'inbox' | 'planned' | 'done'
export type HabitKind = 'timer' | 'plain' | 'counter'

export interface Sphere { id: string; name: string; color: string; weekly_goal_minutes: number; description?: string | null }
export type SpherePatch = Partial<Pick<Sphere, 'name' | 'color' | 'description' | 'weekly_goal_minutes'>>
/** Проект всегда лежит внутри сферы; задача может быть без проекта */
export interface Project { id: string; sphere_id: string; name: string; status?: 'active' | 'done' | 'archived' }
export interface Task {
  id: string; title: string; status: TaskStatus
  sphere_id: string | null; project_id?: string | null; due_date: string | null; start_time: string | null
  estimate_minutes: number | null; done_at: string | null; recurrence_id?: string | null
  note?: string | null                    // описание задачи
  remind_before_minutes?: number | null   // null — не напоминать; 0 — в момент начала
}
export type RecurrenceFreq = 'day' | 'week' | 'month' | 'year'
export type RecurrenceMode = 'schedule' | 'after_completion'
export interface Recurrence {
  id: string; title: string; sphere_id: string | null; start_time: string | null
  estimate_minutes: number | null; remind_before_minutes?: number | null; freq: RecurrenceFreq; interval_n: number
  weekdays: number[] | null; month_day: number | null; mode: RecurrenceMode
  starts_on: string; ends_on: string | null
}
export type NewRecurrence = Omit<Recurrence, 'id' | 'month_day' | 'ends_on'>
export interface Habit {
  /** когда создана: дни до этого в трекере не считаются */
  created_at?: string
  id: string; name: string; kind: HabitKind; target_value: number | null; sphere_id: string
}
export interface HabitEntry { habit_id: string; entry_date: string; value: number }
export interface TimeEntry {
  id: string; task_id: string | null; habit_id: string | null; sphere_id: string | null
  started_at: string; ended_at: string | null; source: 'timer' | 'manual'
}
export interface WeekGoal { sphere_id: string; week_start: string; minutes: number }
export interface WeekData {
  week_start: string; total_minutes: number; prev_total_minutes: number
  spheres: { sphere_id: string; name: string; color: string; minutes: number; goal_minutes: number }[]
  tasks_done: number; tasks_total: number; habit_days_done: number; habit_days_total: number
  top_time_tasks: { task_id: string; title: string; sphere_id: string | null; estimate_minutes: number | null; spent_minutes: number }[]
}
export interface WeeklyReview {
  week_start: string; snapshot: Partial<WeekData>
  went_well: string | null; got_in_way: string | null; to_change: string | null
  focus_sphere_id: string | null; completed_at: string | null
}
export interface ReviewInput { went_well: string; got_in_way: string; to_change: string; focus_sphere_id: string | null }
export type ExportData = { version: number; exported_at: string } & Record<string, unknown>
export interface Snapshot {
  spheres: Sphere[]; projects: Project[]; tasks: Task[]; habits: Habit[]; recurrences: Recurrence[]
  weekGoals: WeekGoal[]; reviews: WeeklyReview[]
  habitEntries: HabitEntry[]   // за сегодня
  timeEntries: TimeEntry[]     // с начала недели + запущенный
}
export interface NewTask {
  title: string; status: TaskStatus; sphere_id?: string | null; project_id?: string | null
  due_date?: string | null; start_time?: string | null; estimate_minutes?: number | null
  remind_before_minutes?: number | null
  note?: string | null
}
/** Отметки привычек и записи таймера за неделю — для трекера в итоге недели */
export interface HabitWeek { entries: HabitEntry[]; timeEntries: TimeEntry[] }
export interface NewHabit { name: string; kind: HabitKind; target_value: number | null; sphere_id: string }
export interface TimerTarget { task_id?: string; habit_id?: string; sphere_id?: string }
export interface EditorTarget { task_id?: string; habit_id?: string; sphere_id?: string }
export interface PushSub { endpoint: string; p256dh: string; auth_key: string; user_agent: string }
export interface User { id: string; email: string }
export interface GoogleStatus {
  configured: boolean            // на сервере заданы GOOGLE_CLIENT_ID / SECRET
  connected: boolean
  email: string | null
  import_events: boolean         // создавать задачи из событий Google
  last_sync_at: string | null
  last_error: string | null
  report?: { pulled: number; imported: number; unlinked: number; pushed: number; deleted: number; changed: boolean; errors: string[] } | { busy: true }
}

export interface Repo {
  mode: 'demo' | 'supabase'
  session(): Promise<User | null>
  signIn(email: string, password: string): Promise<User>
  signUp(email: string, password: string): Promise<User | null>
  signOut(): Promise<void>
  load(today: string, since: string): Promise<Snapshot>
  addTask(t: NewTask): Promise<Task>
  updateTask(id: string, patch: Partial<NewTask>): Promise<Task>
  removeTask(id: string): Promise<void>
  addSphere(name: string, color: string, goalMinutes: number, description?: string): Promise<Sphere>
  updateSphere(id: string, patch: SpherePatch): Promise<Sphere>
  addProject(sphereId: string, name: string): Promise<Project>
  renameProject(id: string, name: string): Promise<void>
  /** Перенос проекта в другую сферу; задачи, привычки и время переезжают вместе с ним (триггер в базе) */
  moveProject(id: string, sphereId: string): Promise<void>
  archiveProject(id: string): Promise<void>
  restoreProject(id: string): Promise<void>
  removeProject(id: string): Promise<void>   // задачи проекта остаются в сфере, просто без проекта
  addHabit(h: NewHabit): Promise<Habit>
  updateHabit(id: string, patch: Partial<NewHabit>): Promise<Habit>
  /** «Удалить» привычку: уходит из списков, история отметок остаётся в базе */
  archiveHabit(id: string): Promise<void>
  habitWeek(weekStart: string): Promise<HabitWeek>
  startTimer(target: TimerTarget): Promise<TimeEntry>
  stopTimer(): Promise<TimeEntry | null>
  bumpHabit(id: string, delta: number, day: string): Promise<HabitEntry>
  addRecurrence(r: NewRecurrence): Promise<void>
  removeRecurrence(id: string): Promise<void>
  listEntries(target: EditorTarget): Promise<TimeEntry[]>
  addEntry(target: EditorTarget, startedAt: string, endedAt: string): Promise<void>
  updateEntry(id: string, startedAt: string, endedAt: string): Promise<void>
  removeEntry(id: string): Promise<void>
  weekData(weekStart: string): Promise<WeekData>
  setWeekGoal(sphereId: string, weekStart: string, minutes: number, makeDefault: boolean): Promise<void>
  saveReview(weekStart: string, input: ReviewInput, snapshot: WeekData | null, complete: boolean): Promise<void>
  exportAll(): Promise<ExportData>
  savePushSubscription(sub: PushSub): Promise<void>
  removePushSubscription(endpoint: string): Promise<void>
  googleStatus(): Promise<GoogleStatus>
  googleConnect(code: string, redirectUri: string): Promise<GoogleStatus>
  googleDisconnect(): Promise<GoogleStatus>
  googleSettings(importEvents: boolean): Promise<GoogleStatus>
  googleSync(): Promise<GoogleStatus>
}
