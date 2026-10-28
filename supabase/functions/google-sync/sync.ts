// Логика двусторонней синхронизации с Google Календарём — без привязки к Deno/Supabase,
// чтобы её можно было проверить тестом на поддельном Google и поддельной базе.
//
// Правила:
//  * задача со ДАТОЙ и ВРЕМЕНЕМ ↔ событие календаря (длительность = «примерное время», иначе 30 минут);
//  * в приложении изменили (google_dirty) → побеждает приложение; иначе → побеждает Google;
//  * событие удалили в Google → задача остаётся, но теряет время (из календаря Google она пропадает);
//  * задачу удалили в приложении → событие удаляется в Google;
//  * событие, созданное в Google, становится задачей (если включён импорт);
//  * календарей может быть несколько: задачи создаются из выбранных, а задачи из приложения уходят в один выбранный.
//    События календарей «только для чтения» (праздники, чужие) в Google не правятся: там главный Google.

export interface TaskRow {
  id: string
  user_id: string
  title: string
  status: 'inbox' | 'planned' | 'done'
  due_date: string | null      // YYYY-MM-DD
  start_time: string | null    // HH:MM:SS
  estimate_minutes: number | null
  google_event_id: string | null
  google_etag: string | null
  google_all_day: boolean
  google_dirty: boolean
  /** календарь, в котором лежит событие; пусто — основной (так было до v0.9.1) */
  google_calendar_id?: string | null
  updated_at: string
}

export interface GEvent {
  id: string
  status?: string              // 'confirmed' | 'tentative' | 'cancelled'
  etag?: string
  summary?: string
  eventType?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  iCalUID?: string
  attendees?: { self?: boolean; responseStatus?: string }[]
  extendedProperties?: { private?: Record<string, string> }
}

export interface Connection {
  user_id: string
  /** календарь, куда отправляются задачи из приложения ('primary' — основной) */
  calendar_id: string
  import_events: boolean
  /** из каких календарей создавать задачи; пусто/null — только из основного */
  import_calendar_ids?: string[] | null
}

export interface CalendarInfo { id: string; summary: string; primary: boolean; writable: boolean; color?: string | null }

/** Нет доступа к списку календарей: приложению выдан доступ только к событиям — нужно переподключить Google */
export class ScopeError extends Error { scope = true }

export interface Store {
  taskById(id: string): Promise<TaskRow | null>
  tasksByEventIds(userId: string, eventIds: string[]): Promise<TaskRow[]>
  /** Связанные с событиями невыполненные задачи в окне дат (для поиска событий, пропавших из выдачи) */
  linkedTasksInWindow(userId: string, fromDate: string, toDate: string): Promise<TaskRow[]>
  dirtyTasks(userId: string): Promise<TaskRow[]>
  /** Правка со стороны синхронизации: google_dirty не взводится */
  updateTask(id: string, patch: Partial<Pick<TaskRow, 'title' | 'due_date' | 'start_time' | 'estimate_minutes' | 'google_event_id' | 'google_etag' | 'google_all_day' | 'google_dirty' | 'google_calendar_id'>>): Promise<void>
  insertTask(row: { user_id: string; title: string; status: 'planned'; due_date: string | null; start_time: string | null; estimate_minutes: number | null; google_event_id: string; google_etag: string | null; google_all_day: boolean; google_calendar_id: string }): Promise<void>
  markSynced(id: string, eventId: string | null, etag: string | null, allDay: boolean, seenUpdatedAt: string, calendarId?: string | null): Promise<void>
  tombstones(userId: string): Promise<{ id: number; event_id: string; calendar_id?: string | null }[]>
  deleteTombstones(ids: number[]): Promise<void>
  /** События календарей «только для чтения», которые не надо импортировать заново */
  ignoredEvents(userId: string): Promise<{ calendar_id: string; event_id: string }[]>
  ignoreEvent(userId: string, calendarId: string, eventId: string): Promise<void>
}

export interface GoogleApi {
  /** Календари аккаунта. Нет доступа к списку → ScopeError */
  listCalendars(): Promise<CalendarInfo[]>
  listEvents(p: { calendarId: string; timeMin: string; timeMax: string }): Promise<GEvent[]>
  getEvent(calendarId: string, eventId: string): Promise<GEvent | null>   // null — нет такого / удалено
  insertEvent(calendarId: string, body: Record<string, unknown>): Promise<GEvent>
  patchEvent(calendarId: string, eventId: string, body: Record<string, unknown>): Promise<GEvent | null>  // null — события нет
  deleteEvent(calendarId: string, eventId: string): Promise<void>        // отсутствие события — не ошибка
}

export interface SyncReport { pulled: number; imported: number; unlinked: number; pushed: number; deleted: number; changed: boolean; errors: string[]; calendars?: CalendarInfo[]; needsReconnect?: boolean }

export const DEFAULT_MINUTES = 30
export const WINDOW_DAYS = 90

// ---------- Время и часовые пояса ----------

const pad = (n: number) => String(n).padStart(2, '0')

/** Дата и время «на часах» в часовом поясе tz для момента ms */
export function localParts(ms: number, tz: string): { date: string; time: string } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` }
}

/** Момент (мс), когда в поясе tz на часах date + time */
export function zonedToMs(date: string, time: string, tz: string): number {
  const naive = Date.parse(`${date}T${time.length === 5 ? time + ':00' : time}Z`)
  let guess = naive
  for (let i = 0; i < 3; i++) {
    const lp = localParts(guess, tz)
    const shown = Date.parse(`${lp.date}T${lp.time}Z`)
    const diff = naive - shown
    if (diff === 0) break
    guess += diff
  }
  return guess
}

/** К локальным дате и времени прибавить минуты (без пояса: «на часах») */
export function addMinutesLocal(date: string, time: string, minutes: number): { date: string; time: string } {
  const t = Date.parse(`${date}T${time.length === 5 ? time + ':00' : time}Z`) + minutes * 60_000
  const d = new Date(t)
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00` }
}

export function addDaysStr(date: string, days: number): string {
  return addMinutesLocal(date, '00:00:00', days * 1440).date
}

// ---------- Задача ↔ событие ----------

export function taskToEvent(t: TaskRow, tz: string): Record<string, unknown> {
  const base = {
    summary: t.title,
    extendedProperties: { private: { plannerTaskId: t.id } },
    // напоминания о задачах присылает само приложение (push) — чтобы не дублировать их уведомлениями Google
    reminders: { useDefault: false, overrides: [] as unknown[] },
  }
  if (!t.due_date) throw new Error('у задачи нет даты')
  if (!t.start_time) {
    // «на весь день»: конец в Google — следующий день (не включительно)
    return { ...base, start: { date: t.due_date }, end: { date: addDaysStr(t.due_date, 1) } }
  }
  const end = addMinutesLocal(t.due_date, t.start_time, t.estimate_minutes ?? DEFAULT_MINUTES)
  return {
    ...base,
    start: { dateTime: `${t.due_date}T${t.start_time.slice(0, 8)}`, timeZone: tz },
    end: { dateTime: `${end.date}T${end.time}`, timeZone: tz },
  }
}

export interface EventFields { title: string; due_date: string; start_time: string | null; estimate_minutes: number | null; all_day: boolean }

/** Поля задачи из события; null — событие нельзя представить задачей */
export function eventToFields(e: GEvent, tz: string): EventFields | null {
  const title = (e.summary ?? '').trim().slice(0, 500) || '(без названия)'
  if (e.start?.date) return { title, due_date: e.start.date, start_time: null, estimate_minutes: null, all_day: true }
  if (!e.start?.dateTime) return null
  const s = Date.parse(e.start.dateTime)
  if (Number.isNaN(s)) return null
  const lp = localParts(s, tz)
  let minutes: number | null = null
  if (e.end?.dateTime) {
    const m = Math.round((Date.parse(e.end.dateTime) - s) / 60_000)
    if (m >= 1 && m <= 24 * 60) minutes = m
  }
  return { title, due_date: lp.date, start_time: lp.time, estimate_minutes: minutes, all_day: false }
}

const sameTime = (a: string | null, b: string | null) => (a ?? '').slice(0, 5) === (b ?? '').slice(0, 5)

// Сбой на одной задаче/событии не должен останавливать остальное; ошибки доступа (fatal) — останавливают всё
async function guarded(rep: SyncReport, what: string, fn: () => Promise<void>): Promise<void> {
  try { await fn() } catch (e) {
    if ((e as { fatal?: boolean }).fatal) throw e
    rep.errors.push(`${what}: ${(e as Error).message}`)
  }
}

// ---------- Синхронизация одного пользователя ----------

export interface SyncOpts { store: Store; google: GoogleApi; conn: Connection; tz: string; now?: number }

const PRIMARY_ONLY: CalendarInfo[] = [{ id: 'primary', summary: 'Основной календарь', primary: true, writable: true }]
const key = (cal: string, id: string) => cal + '\u0000' + id

export async function syncUser(o: SyncOpts): Promise<SyncReport> {
  const { store, google, conn, tz } = o
  const now = o.now ?? Date.now()
  const rep: SyncReport = { pulled: 0, imported: 0, unlinked: 0, pushed: 0, deleted: 0, changed: false, errors: [] }
  const userId = conn.user_id
  const today = localParts(now, tz).date
  const winEnd = addDaysStr(today, WINDOW_DAYS)

  // ===== Календари аккаунта =====
  let cals: CalendarInfo[]
  try { cals = await google.listCalendars() } catch (e) {
    if (!(e as { scope?: boolean }).scope) throw e
    rep.needsReconnect = true; cals = PRIMARY_ONLY          // нет доступа к списку — работаем только с основным календарём
  }
  rep.calendars = cals
  const meta = new Map(cals.map(c => [c.id, c]))
  const primaryId = cals.find(c => c.primary)?.id ?? 'primary'
  const resolve = (id: string | null | undefined) => (!id || id === 'primary' ? primaryId : id)
  const writable = (id: string) => meta.get(id)?.writable ?? true
  let exportCal = resolve(conn.calendar_id)
  if (meta.size && (!meta.has(exportCal) || !writable(exportCal))) exportCal = primaryId   // выбранного календаря нет или в него нельзя писать
  const importSet = new Set((conn.import_calendar_ids ?? [primaryId]).map(resolve).filter(id => !meta.size || meta.has(id)))
  const calOf = (t: TaskRow) => resolve(t.google_calendar_id)

  // ===== 0. Задачи, удалённые в приложении =====
  // Событие, созданное самим приложением, удаляем. Чужое событие (импортированное из Google) не трогаем —
  // только помечаем, чтобы оно не превратилось в задачу заново (в календаре «только для чтения» помечаем у себя в базе).
  const stones = await store.tombstones(userId)
  const dead = new Set<string>()
  for (const s of stones) {
    const cal = resolve(s.calendar_id)
    dead.add(key(cal, s.event_id))
    await guarded(rep, `удалённая задача ${s.event_id}`, async () => {
      if (!writable(cal)) { await store.ignoreEvent(userId, cal, s.event_id); return }
      const ev = await google.getEvent(cal, s.event_id)
      if (!ev || ev.status === 'cancelled') return
      if (ev.extendedProperties?.private?.plannerTaskId) { await google.deleteEvent(cal, s.event_id); rep.deleted++ }
      else await google.patchEvent(cal, s.event_id, { extendedProperties: { private: { plannerIgnore: '1' } } })
    })
  }
  if (stones.length) await store.deleteTombstones(stones.map(s => s.id))
  const ignored = new Set((await store.ignoredEvents(userId)).map(x => key(x.calendar_id, x.event_id)))

  // Связанные с событиями невыполненные задачи в окне дат
  const linked = await store.linkedTasksInWindow(userId, today, winEnd)

  // Какие календари читаем: выбранные для импорта, календарь отправки и те, где уже лежат связанные задачи
  const readSet = new Set<string>([...importSet, exportCal, ...linked.map(calOf)])
  const readCals = [...cals.map(c => c.id).filter(id => readSet.has(id)), ...[...readSet].filter(id => !meta.has(id))]

  // ===== 1. Из Google в приложение =====
  const uidSeen = new Set<string>()      // одно и то же событие в двух календарях (общие встречи) импортируем один раз

  const pullCalendar = async (cal: string): Promise<void> => {
    const canImport = conn.import_events && importSet.has(cal)
    let events: GEvent[]
    try {
      events = await google.listEvents({
        calendarId: cal,
        timeMin: new Date(zonedToMs(today, '00:00:00', tz)).toISOString(),
        timeMax: new Date(zonedToMs(winEnd, '00:00:00', tz)).toISOString(),
      })
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e
      rep.errors.push(`календарь «${meta.get(cal)?.summary ?? cal}»: ${(e as Error).message}`)
      return
    }
    const seen = new Set(events.map(e => e.id))

    // связанные задачи этого календаря, чьи события не пришли в выдаче (удалены или перенесены за пределы окна) — спросим про каждое отдельно
    const linkedHere = linked.filter(t => calOf(t) === cal)
    const missing = linkedHere.filter(t => t.google_event_id && !seen.has(t.google_event_id))
    for (const t of missing) {
      const e = await google.getEvent(cal, t.google_event_id!)
      events.push(e ?? { id: t.google_event_id!, status: 'cancelled' })
      seen.add(t.google_event_id!)
    }

    const byEvent = new Map<string, TaskRow>()
    for (const t of await store.tasksByEventIds(userId, events.map(e => e.id))) if (calOf(t) === cal) byEvent.set(t.google_event_id!, t)
    for (const t of linkedHere) if (t.google_event_id) byEvent.set(t.google_event_id, t)

    const pullOne = async (e: GEvent): Promise<void> => {
      if (dead.has(key(cal, e.id)) || ignored.has(key(cal, e.id)) || e.extendedProperties?.private?.plannerIgnore) return
      const task = byEvent.get(e.id) ?? null
      const cancelled = e.status === 'cancelled'

      if (cancelled) {
        if (task) {
          if (task.google_dirty) {
            // в приложении есть неотправленная правка — она новее: снимаем только связь, ниже создадим событие заново
            await store.updateTask(task.id, { google_event_id: null, google_etag: null, google_calendar_id: null })
          } else {
            // событие удалили в Google: задача остаётся, но без времени и без связи
            await store.updateTask(task.id, { start_time: null, google_event_id: null, google_etag: null, google_all_day: false, google_dirty: false, google_calendar_id: null })
            rep.unlinked++; rep.changed = true
          }
        }
        return
      }
      const uid = e.iCalUID

      if (task) {
        if (uid) uidSeen.add(uid)
        if (task.google_dirty) return                       // правка в приложении новее — отправим её ниже
        if (e.etag && e.etag === task.google_etag) return   // это наше же событие, ничего не менялось
        const f = eventToFields(e, tz)
        if (!f) return
        const patch: Parameters<Store['updateTask']>[1] = { google_etag: e.etag ?? null, google_all_day: f.all_day, google_dirty: false }
        if (!task.google_calendar_id) patch.google_calendar_id = cal
        let diff = false
        if (f.title !== task.title) { patch.title = f.title; diff = true }
        if (f.due_date !== task.due_date) { patch.due_date = f.due_date; diff = true }
        if (!sameTime(f.start_time, task.start_time)) { patch.start_time = f.start_time; diff = true }
        // у события «на весь день» длительности нет — «примерное время» задачи не трогаем
        if (!f.all_day && f.estimate_minutes != null && f.estimate_minutes !== task.estimate_minutes) { patch.estimate_minutes = f.estimate_minutes; diff = true }
        await store.updateTask(task.id, patch)
        if (diff) { rep.pulled++; rep.changed = true }
        return
      }

      // события нет среди связанных задач
      const pid = e.extendedProperties?.private?.plannerTaskId
      if (pid) {
        const own = await store.taskById(pid)
        if (own && !own.google_event_id) {                    // потеряли связь (например, переподключение) — восстанавливаем
          await store.markSynced(own.id, e.id, e.etag ?? null, !!e.start?.date, '1970-01-01T00:00:00Z', cal)   // dirty остаётся: ниже в Google уйдёт актуальное содержимое задачи
          return
        }
        return                                              // задача удалена или привязана к другому событию
      }
      if (!canImport) return
      if (e.eventType && e.eventType !== 'default') return  // дни рождения, «не на месте» и т. п.
      if (e.attendees?.some(a => a.self && a.responseStatus === 'declined')) return
      if (uid && uidSeen.has(uid)) return                   // то же событие уже взято из другого календаря
      const f = eventToFields(e, tz)
      if (!f || f.due_date < today || f.due_date >= winEnd) return
      await store.insertTask({
        user_id: userId, title: f.title, status: 'planned', due_date: f.due_date, start_time: f.start_time,
        estimate_minutes: f.estimate_minutes, google_event_id: e.id, google_etag: e.etag ?? null, google_all_day: f.all_day, google_calendar_id: cal,
      })
      if (uid) uidSeen.add(uid)
      rep.imported++; rep.changed = true
    }
    for (const e of events) await guarded(rep, `событие ${e.id}`, () => pullOne(e))
  }
  for (const cal of readCals) await pullCalendar(cal)

  // ===== 2. Из приложения в Google =====
  const pushOne = async (t: TaskRow): Promise<void> => {
    const wanted = !!t.due_date && (!!t.start_time || t.google_all_day) && t.status !== 'done'
    // уже связанная задача остаётся в своём календаре, новая уходит в выбранный для отправки
    const cal = t.google_event_id ? calOf(t) : exportCal

    if (t.google_event_id && !writable(cal)) {              // календарь «только для чтения»: в Google ничего не правим, главный — Google
      await store.markSynced(t.id, t.google_event_id, t.google_etag, t.google_all_day, t.updated_at, cal)
      return
    }
    if (t.status === 'done' && t.google_event_id) {         // выполненную задачу оставляем в календаре как есть
      await store.markSynced(t.id, t.google_event_id, t.google_etag, t.google_all_day, t.updated_at, cal)
      return
    }
    if (!wanted) {
      if (t.google_event_id) { await google.deleteEvent(cal, t.google_event_id); rep.deleted++; rep.changed = true }
      await store.markSynced(t.id, null, null, false, t.updated_at)
      return
    }
    const body = taskToEvent(t, tz)
    let ev: GEvent | null = null
    if (t.google_event_id) ev = await google.patchEvent(cal, t.google_event_id, body)
    if (!ev) ev = await google.insertEvent(cal, body)       // нет связи или событие уже удалили
    await store.markSynced(t.id, ev.id, ev.etag ?? null, !t.start_time, t.updated_at, cal)
    rep.pushed++
  }
  for (const t of await store.dirtyTasks(userId)) await guarded(rep, `задача ${t.id}`, () => pushOne(t))
  return rep
}
