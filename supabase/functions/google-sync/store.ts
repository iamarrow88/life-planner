// Доступ к базе Supabase для синхронизации (ключ service_role).
import type { Store, TaskRow } from './sync.ts'

// deno-lint-ignore no-explicit-any
type Client = any

const BASE_COLS = 'id,user_id,title,status,due_date,start_time,estimate_minutes,google_event_id,google_etag,google_all_day,google_dirty,google_calendar_id,updated_at'
/** google_imported — из planner_google_imported.sql. Пока его не выполнили, работаем без отметки (как раньше) */
let COLS = BASE_COLS + ',google_imported'
let hasImported = true
const noImported = (r: { error: { message: string } | null }) => !!r.error && hasImported && r.error.message.includes('google_imported')
function dropImported() { hasImported = false; COLS = BASE_COLS }
const BATCH = 200

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export function supabaseStore(sb: Client): Store {
  return {
    async taskById(id) {
      let r = await sb.from('tasks').select(COLS).eq('id', id).maybeSingle()
      if (noImported(r)) { dropImported(); r = await sb.from('tasks').select(COLS).eq('id', id).maybeSingle() }
      return check(r) as TaskRow | null
    },
    async tasksByEventIds(userId, ids) {
      const out: TaskRow[] = []
      for (let i = 0; i < ids.length; i += BATCH) {
        out.push(...(check(await sb.from('tasks').select(COLS).eq('user_id', userId).in('google_event_id', ids.slice(i, i + BATCH))) as TaskRow[]))
      }
      return out
    },
    async linkedTasksInWindow(userId, from, to) {
      const q = () => sb.from('tasks').select(COLS).eq('user_id', userId).not('google_event_id', 'is', null).gte('due_date', from).lt('due_date', to).neq('status', 'done')
      let r = await q()
      if (noImported(r)) { dropImported(); r = await q() }
      return check(r) as TaskRow[]
    },
    async dirtyTasks(userId) {
      return check(await sb.from('tasks').select(COLS).eq('user_id', userId).eq('google_dirty', true).order('updated_at').limit(BATCH)) as TaskRow[]
    },
    async updateTask(id, patch) {
      const { google_imported, ...rest } = patch
      const p = hasImported || google_imported === undefined ? patch : rest
      if (Object.keys(p).length) check(await sb.from('tasks').update(p).eq('id', id))
    },
    async insertTask(row) {
      const { google_imported, ...rest } = row
      check(await sb.from('tasks').insert({ ...(hasImported ? { ...rest, google_imported } : rest), google_dirty: false }))
    },
    async deleteTaskWithoutTime(id) {
      const r = await sb.from('time_entries').select('id', { count: 'exact', head: true }).eq('task_id', id)
      check(r)
      if (r.count) return false
      check(await sb.from('tasks').delete().eq('id', id))
      return true
    },
    async markSynced(id, eventId, etag, allDay, seen, calendarId) {
      check(await sb.rpc('google_mark_synced', { p_id: id, p_event_id: eventId, p_etag: etag, p_all_day: allDay, p_seen: seen, p_calendar_id: calendarId ?? null }))
    },
    async tombstones(userId) {
      return check(await sb.from('google_tombstones').select('id,event_id,calendar_id').eq('user_id', userId).order('id').limit(BATCH)) as { id: number; event_id: string; calendar_id: string | null }[]
    },
    async deleteTombstones(ids) { check(await sb.from('google_tombstones').delete().in('id', ids)) },
    async ignoredEvents(userId) {
      return check(await sb.from('google_ignored').select('calendar_id,event_id').eq('user_id', userId)) as { calendar_id: string; event_id: string }[]
    },
    async ignoreEvent(userId, calendarId, eventId) {
      check(await sb.from('google_ignored').upsert({ user_id: userId, calendar_id: calendarId, event_id: eventId }, { onConflict: 'user_id,calendar_id,event_id' }))
    },
  }
}
