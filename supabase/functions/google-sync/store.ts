// Доступ к базе Supabase для синхронизации (ключ service_role).
import type { Store, TaskRow } from './sync.ts'

// deno-lint-ignore no-explicit-any
type Client = any

const COLS = 'id,user_id,title,status,due_date,start_time,estimate_minutes,google_event_id,google_etag,google_all_day,google_dirty,updated_at'
const BATCH = 200

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export function supabaseStore(sb: Client): Store {
  return {
    async taskById(id) {
      return (check(await sb.from('tasks').select(COLS).eq('id', id).maybeSingle()) as TaskRow | null)
    },
    async tasksByEventIds(userId, ids) {
      const out: TaskRow[] = []
      for (let i = 0; i < ids.length; i += BATCH) {
        out.push(...(check(await sb.from('tasks').select(COLS).eq('user_id', userId).in('google_event_id', ids.slice(i, i + BATCH))) as TaskRow[]))
      }
      return out
    },
    async linkedTasksInWindow(userId, from, to) {
      return check(await sb.from('tasks').select(COLS).eq('user_id', userId).not('google_event_id', 'is', null)
        .gte('due_date', from).lt('due_date', to).neq('status', 'done')) as TaskRow[]
    },
    async dirtyTasks(userId) {
      return check(await sb.from('tasks').select(COLS).eq('user_id', userId).eq('google_dirty', true).order('updated_at').limit(BATCH)) as TaskRow[]
    },
    async updateTask(id, patch) { check(await sb.from('tasks').update(patch).eq('id', id)) },
    async insertTask(row) { check(await sb.from('tasks').insert({ ...row, google_dirty: false })) },
    async markSynced(id, eventId, etag, allDay, seen) {
      check(await sb.rpc('google_mark_synced', { p_id: id, p_event_id: eventId, p_etag: etag, p_all_day: allDay, p_seen: seen }))
    },
    async tombstones(userId) {
      return check(await sb.from('google_tombstones').select('id,event_id').eq('user_id', userId).order('id').limit(BATCH)) as { id: number; event_id: string }[]
    },
    async deleteTombstones(ids) { check(await sb.from('google_tombstones').delete().in('id', ids)) },
  }
}
