export type TaskStatus = 'inbox' | 'planned' | 'done'
/** Подзадача — пункт чек-листа внутри задачи */
/** Желание: просто запись «хочу», без дат и сроков. fulfilled_at — когда исполнилось, task_id — задача, созданная из желания */
export interface Wish {
  id: string; title: string; note: string | null; url: string | null; price: number | null; category: string | null
  position: number; fulfilled_at: string | null; task_id: string | null; created_at?: string
}
export type NewWish = Pick<Wish, 'title' | 'category' | 'position'>
export type WishPatch = Partial<Omit<Wish, 'id' | 'created_at'>>
/** Перенос задачи: с какой даты (null — была без даты), на какую и когда перенесли */
export interface Postpone { from: string | null; to: string; at: string }
export interface Subtask { id: string; title: string; done: boolean }
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
  tags?: string[]                         // теги: строчными, без «#»
  budget?: number | null                  // бюджет, BYN (null — не задан)
  position?: number | null                // место в списке, заданное перетаскиванием (null — не двигали)
  subtasks?: Subtask[]
  postpones?: Postpone[]                  // переносы кнопкой «↷ Перенести»: откуда, куда, когда
  updated_at?: string                     // когда задачу последний раз меняли (для «залежавшихся» отложенных)
}
export type RecurrenceFreq = 'day' | 'week' | 'month' | 'year'
export type RecurrenceMode = 'schedule' | 'after_completion'
export interface Recurrence {
  id: string; title: string; note?: string | null; sphere_id: string | null; project_id?: string | null; start_time: string | null
  estimate_minutes: number | null; remind_before_minutes?: number | null; freq: RecurrenceFreq; interval_n: number
  weekdays: number[] | null; month_day: number | null; mode: RecurrenceMode
  starts_on: string; ends_on: string | null
  tags?: string[]
  budget?: number | null
  subtasks?: Subtask[]                     // шаблон: новые задачи по правилу получают их невыполненными
}
export type NewRecurrence = Omit<Recurrence, 'id' | 'month_day' | 'ends_on'>
/** Правка правила: поля расписания (freq…starts_on) пересоздают будущие задачи, поля шаблона (title…) переносятся в будущие невыполненные */
export type RecurrencePatch = Partial<NewRecurrence>
export const RULE_KEYS = ['freq', 'interval_n', 'weekdays', 'mode', 'starts_on'] as const
export const TEMPLATE_KEYS = ['title', 'note', 'sphere_id', 'project_id', 'start_time', 'estimate_minutes', 'remind_before_minutes', 'tags', 'budget', 'subtasks'] as const
/** Расписание привычки: как часто и от какой даты отсчитывать (как у повторяющихся задач) */
export interface HabitSchedule {
  freq: RecurrenceFreq; interval_n: number; weekdays: number[]
  /** 'schedule' — по расписанию от даты начала; 'after_completion' — следующий раз через интервал после выполнения */
  mode: RecurrenceMode
  starts_on: string | null
}
export interface Habit extends Partial<HabitSchedule> {
  /** когда создана: дни до этого в трекере не считаются */
  created_at?: string
  id: string; name: string; kind: HabitKind; target_value: number | null; sphere_id: string
  /** окно активности: вне его привычка не запланирована (null — без ограничения) */
  active_from?: string | null; active_until?: string | null
  /** время дня (для напоминания), 'HH:MM:SS' */
  remind_at?: string | null
}
/** День привычки: значение, норма, выполнена ли и запланирована ли на этот день */
export interface HabitDay { habit_id: string; day: string; value: number; target: number; done: boolean; scheduled: boolean }
/** Состояние привычки на сегодня: запланирована ли, когда срок, когда последний раз выполнена */
export interface HabitStatus { habit_id: string; scheduled: boolean; due: string | null; last_done: string | null }
export interface HabitEntry { habit_id: string; entry_date: string; value: number }
export interface TimeEntry {
  id: string; task_id: string | null; habit_id: string | null; sphere_id: string | null
  started_at: string; ended_at: string | null; source: 'timer' | 'manual'
}
export interface WeekGoal { sphere_id: string; week_start: string; minutes: number }
/** Бюджет времени: сколько в день уходит на сон и «текучку» (еда, дорога, быт) — это время не делится между сферами */
export interface TimeBudget { sleep_minutes_per_day: number; routine_minutes_per_day: number }
/** Часы работы за неделю (тоже не делятся между сферами) */
export interface WeekWork { week_start: string; minutes: number }
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
/** Что делать с содержимым сферы при её архивации */
export interface SpherePlan {
  projects: Record<string, string>                                         // id проекта → id сферы или 'archive'
  tasks: Record<string, { sphere_id: string | null; project_id: string | null }>
  habits: Record<string, string>                                           // id привычки → id сферы или 'archive'
  recurrences: Record<string, string | null>                               // id шаблона повтора → id сферы или null
}
export interface Snapshot {
  spheres: Sphere[]; archivedSpheres?: Sphere[]; projects: Project[]; tasks: Task[]; habits: Habit[]; recurrences: Recurrence[]
  weekGoals: WeekGoal[]; reviews: WeeklyReview[]
  habitEntries: HabitEntry[]   // за сегодня
  timeEntries: TimeEntry[]     // с начала недели + запущенный
  habitStatus?: HabitStatus[]  // состояние привычек на сегодня (считает база)
  timeBudget?: TimeBudget | null // null — в базе ещё нет этих полей (не выполнен planner_time_budget.sql)
  weekWork?: WeekWork[]
  cycle?: CycleData | null      // null — в базе ещё нет таблиц цикла (не выполнен planner_cycle.sql)
  tagsReady?: boolean           // false — в базе ещё нет тегов (не выполнен planner_tags.sql)
  budgetReady?: boolean         // false — в базе ещё нет бюджета задач (не выполнен planner_budget.sql)
  orderReady?: boolean          // false — в базе ещё нет порядка задач (не выполнен planner_task_order.sql)
  wishes?: Wish[]
  wishesReady?: boolean          // false — в базе ещё нет желаний (не выполнен planner_wishes.sql)
  sphereColors?: string[] | null  // свой набор цветов для сфер (null — набор по умолчанию)
  colorsReady?: boolean          // false — в базе ещё нет набора цветов (не выполнен planner_sphere_colors.sql)
  postponesReady?: boolean      // false — в базе ещё нет истории переносов (не выполнен planner_task_postpone.sql)
  subtasksReady?: boolean       // false — в базе ещё нет подзадач (не выполнен planner_subtasks.sql)
}
export interface NewTask {
  title: string; status: TaskStatus; sphere_id?: string | null; project_id?: string | null
  due_date?: string | null; start_time?: string | null; estimate_minutes?: number | null
  remind_before_minutes?: number | null
  note?: string | null
  tags?: string[]
  budget?: number | null
  subtasks?: Subtask[]
  postpones?: Postpone[]
}
export interface NewHabit extends Partial<HabitSchedule> {
  name: string; kind: HabitKind; target_value: number | null; sphere_id: string
  active_from?: string | null; active_until?: string | null; remind_at?: string | null
}
// ---- Календарь цикла
/** Отмеченный день: менструация, первый день цикла, заметка */
export interface CycleDay {
  day: string; period: boolean; cycle_start: boolean; note: string | null
  cycle_note?: string | null   // примечание ко всему циклу — у первого дня цикла
}
export interface CycleSettings {
  link_label: string                 // подпись строки на «Сегодня»: «<подпись> <номер дня>»
  sphere_id: string | null           // сфера привычек-таблеток (null — «Здоровье» или первая)
  course_from_day: number            // курс начинается с этого дня цикла (1 — с первого)
  course_days: number                // длина курса, дней
  morning_time: string; evening_time: string
  morning_habit_id: string | null; evening_habit_id: string | null
}
/** Курс таблеток: отдельная запись на каждый цикл; схема копируется в запись, чтобы смена настроек не меняла прошлые курсы */
export interface PillCourse {
  id: string; kind: 'cycle' | 'fixed'; cycle_start: string | null; from_day: number | null; days: number | null
  starts_on: string; ends_on: string
}
export type NewPillCourse = Omit<PillCourse, 'id'>
/** Отметка привычки-таблетки за день (для истории циклов; включая удалённые привычки) */
export interface PillEntry { habit_id: string; name: string; entry_date: string; value: number }
export interface CycleData { days: CycleDay[]; settings: CycleSettings; courses: PillCourse[] }
export interface TimerTarget { task_id?: string; habit_id?: string; sphere_id?: string }
export interface EditorTarget { task_id?: string; habit_id?: string; sphere_id?: string }
export interface PushSub { endpoint: string; p256dh: string; auth_key: string; user_agent: string }
export interface User { id: string; email: string }
export interface CaptureInfo { created_at: string; last_used_at: string | null }
export interface GoogleCalendar { id: string; summary: string; primary: boolean; writable: boolean; color?: string | null }
export interface GoogleSettingsPatch { import_events?: boolean; import_calendar_ids?: string[]; export_calendar_id?: string }
export interface GoogleStatus {
  configured: boolean            // на сервере заданы GOOGLE_CLIENT_ID / SECRET
  connected: boolean
  email: string | null
  import_events: boolean         // создавать задачи из событий Google
  calendars?: GoogleCalendar[]   // календари аккаунта (список обновляется при синхронизации)
  import_calendar_ids?: string[] // из каких календарей создавать задачи
  export_calendar_id?: string | null // в какой календарь отправлять задачи из приложения
  can_list_calendars?: boolean   // выдан ли доступ к списку календарей (иначе работает только основной)
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
  /** Сфера становится проектом в сфере targetId (всё её содержимое — туда же); возвращает id нового проекта */
  sphereToProject(id: string, targetId: string): Promise<string>
  archiveSphere(id: string): Promise<void>
  restoreSphere(id: string, newName?: string): Promise<void>
  moveHabit(id: string, sphereId: string): Promise<void>
  moveRecurrence(id: string, sphereId: string | null): Promise<void>
  archiveProject(id: string): Promise<void>
  restoreProject(id: string): Promise<void>
  removeProject(id: string): Promise<void>   // задачи проекта остаются в сфере, просто без проекта
  addHabit(h: NewHabit): Promise<Habit>
  updateHabit(id: string, patch: Partial<NewHabit>): Promise<Habit>
  /** «Удалить» привычку: уходит из списков, история отметок остаётся в базе */
  archiveHabit(id: string): Promise<void>
  /** Сохранить порядок привычек: id всех привычек в нужном порядке */
  reorderHabits(ids: string[]): Promise<void>
  /** Свой порядок сфер / проектов одной сферы: id в нужном порядке (position = номер в списке) */
  reorderSpheres(ids: string[]): Promise<void>
  reorderProjects(ids: string[]): Promise<void>
  /** Свой порядок задач списка: id в нужном порядке (position = номер в списке) */
  reorderTasks(ids: string[]): Promise<void>
  /** Все дни диапазона по каждой привычке: значение, выполнена ли, запланирована ли */
  habitDays(from: string, to: string): Promise<HabitDay[]>
  habitStatus(day: string): Promise<HabitStatus[]>
  startTimer(target: TimerTarget): Promise<TimeEntry>
  stopTimer(): Promise<TimeEntry | null>
  bumpHabit(id: string, delta: number, day: string): Promise<HabitEntry>
  addRecurrence(r: NewRecurrence): Promise<void>
  removeRecurrence(id: string): Promise<void>
  /** Сделать существующую задачу повторяющейся: создаётся правило, задача становится его первым разом */
  attachRecurrence(taskId: string, r: NewRecurrence): Promise<void>
  /** Изменить правило. keepTaskId — задача, которую правят прямо сейчас: её не трогаем */
  updateRecurrence(id: string, patch: RecurrencePatch, keepTaskId?: string): Promise<void>
  /** Перестать повторять: правило и будущие невыполненные задачи удаляются, keepTaskId остаётся обычной задачей */
  detachRecurrence(id: string, keepTaskId: string): Promise<void>
  listEntries(target: EditorTarget): Promise<TimeEntry[]>
  addEntry(target: EditorTarget, startedAt: string, endedAt: string): Promise<void>
  updateEntry(id: string, startedAt: string, endedAt: string): Promise<void>
  removeEntry(id: string): Promise<void>
  weekData(weekStart: string): Promise<WeekData>
  setWeekGoal(sphereId: string, weekStart: string, minutes: number, makeDefault: boolean): Promise<void>
  addWish(w: NewWish): Promise<Wish>
  updateWish(id: string, patch: WishPatch): Promise<Wish>
  removeWish(id: string): Promise<void>
  /** Порядок желаний: id в нужном порядке (position = номер в списке) */
  reorderWishes(ids: string[]): Promise<void>
  /** Свой набор цветов для сфер; null — вернуться к набору по умолчанию */
  saveSphereColors(colors: string[] | null): Promise<void>
  saveTimeBudget(patch: Partial<TimeBudget>): Promise<void>
  setWeekWork(weekStart: string, minutes: number): Promise<void>
  /** Записать день цикла целиком; пустой день (без отметок и заметки) удаляется */
  /** Переименовать тег (слить с существующим) во всех задачах и повторах; to = null — удалить тег */
  renameTag(from: string, to: string | null): Promise<void>
  setCycleDay(d: CycleDay): Promise<void>
  saveCycleSettings(patch: Partial<CycleSettings>): Promise<void>
  addCourse(c: NewPillCourse): Promise<PillCourse>
  updateCourse(id: string, patch: Partial<NewPillCourse>): Promise<void>
  removeCourse(id: string): Promise<void>
  /** Отметки таблеток за период: привычки с такими id или названиями, в том числе удалённые */
  pillEntries(from: string, to: string, ids: string[], names: string[]): Promise<PillEntry[]>
  saveReview(weekStart: string, input: ReviewInput, snapshot: WeekData | null, complete: boolean): Promise<void>
  exportAll(): Promise<ExportData>
  savePushSubscription(sub: PushSub): Promise<void>
  removePushSubscription(endpoint: string): Promise<void>
  googleStatus(): Promise<GoogleStatus>
  googleConnect(code: string, redirectUri: string): Promise<GoogleStatus>
  googleDisconnect(): Promise<GoogleStatus>
  googleSettings(patch: GoogleSettingsPatch): Promise<GoogleStatus>
  googleSync(): Promise<GoogleStatus>
  // ключ быстрого ввода (приложение для часов): сам ключ показывается один раз при создании
  captureInfo(): Promise<CaptureInfo | null>
  captureCreate(): Promise<string>
  captureRevoke(): Promise<void>
}
