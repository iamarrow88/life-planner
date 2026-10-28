// Supabase Edge Function: синхронизация с Google Календарём.
// Вызывается (1) из приложения (с токеном пользователя): status / connect / disconnect / settings / sync,
//            (2) по расписанию pg_cron раз в 5 минут (заголовок x-cron-secret) — синхронизирует всех подключённых.
// Секреты: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CRON_SECRET (+ SUPABASE_URL и ключ базы подставляет сам Supabase).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { resolveAdminKey } from './admin.ts'
import { calendarApi, exchangeCode, GoogleAuthError, refreshAccessToken, revokeToken } from './google.ts'
import { supabaseStore } from './store.ts'
import { syncUser, type CalendarInfo, type SyncReport } from './sync.ts'

const env = (k: string) => Deno.env.get(k) ?? ''
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS })

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface Conn { user_id: string; refresh_token: string; google_email: string | null; calendar_id: string; import_events: boolean; import_calendar_ids: string[] | null; calendars: CalendarInfo[] | null; can_list_calendars: boolean; last_sync_at: string | null; last_error: string | null }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const adminKey = resolveAdminKey(Deno.env.get.bind(Deno.env))
  const clientId = env('GOOGLE_CLIENT_ID'), clientSecret = env('GOOGLE_CLIENT_SECRET')
  const missing = ['SUPABASE_URL'].filter(k => !env(k))
  if (!adminKey) missing.push('ключ доступа к базе (SUPABASE_SECRET_KEYS или SERVICE_KEY)')
  if (!clientId) missing.push('GOOGLE_CLIENT_ID')
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET')
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action ?? 'sync')

  if (missing.length && action !== 'status') {
    return json({ error: 'На сервере не заданы: ' + missing.join(', ') + '. Смотри GOOGLE.md, шаг 3.' }, 500)
  }
  const sb = createClient(env('SUPABASE_URL'), adminKey || 'x', { auth: { persistSession: false } })
  const store = supabaseStore(sb)

  async function syncOne(conn: Conn): Promise<SyncReport | { busy: true }> {
    // замок: не даём двум синхронизациям одного пользователя идти одновременно
    const until = new Date(Date.now() + 2 * 60_000).toISOString()
    const nowIso = new Date().toISOString()
    const got = await sb.from('google_connections').update({ sync_lock_until: until })
      .eq('user_id', conn.user_id).or(`sync_lock_until.is.null,sync_lock_until.lt.${nowIso}`).select('user_id')
    if (got.error) throw new Error(got.error.message)
    if (!got.data?.length) return { busy: true }
    try {
      const access = await refreshAccessToken({ clientId, clientSecret, refreshToken: conn.refresh_token })
      const tz = (await sb.rpc('user_tz', { p_user: conn.user_id })).data as string | null
      const rep = await syncUser({ store, google: calendarApi(access), conn, tz: tz || 'UTC' })
      const cache: Record<string, unknown> = {}
      if (rep.calendars && !rep.needsReconnect) { cache.calendars = rep.calendars; cache.can_list_calendars = true }
      else if (rep.needsReconnect) cache.can_list_calendars = false
      await sb.from('google_connections').update({
        ...cache,
        last_sync_at: new Date().toISOString(),
        last_error: rep.errors.length ? `Часть элементов не синхронизирована: ${rep.errors[0]}` : null,
      }).eq('user_id', conn.user_id)
      return rep
    } catch (e) {
      const msg = e instanceof GoogleAuthError ? 'Доступ к Google отозван или истёк. Отключи и подключи Google заново.' : (e as Error).message
      await sb.from('google_connections').update({ last_error: msg }).eq('user_id', conn.user_id)
      throw e
    } finally {
      await sb.from('google_connections').update({ sync_lock_until: null }).eq('user_id', conn.user_id)
    }
  }

  const getConn = async (userId: string) =>
    (await sb.from('google_connections').select('*').eq('user_id', userId).maybeSingle()).data as Conn | null
  const primaryOf = (c: Conn) => c.calendars?.find(x => x.primary)?.id ?? 'primary'
  const statusOf = (c: Conn | null) => ({
    configured: !!(clientId && clientSecret),
    connected: !!c, email: c?.google_email ?? null, import_events: c?.import_events ?? true,
    calendars: c?.calendars ?? [],
    import_calendar_ids: c ? (c.import_calendar_ids ?? [primaryOf(c)]) : [],
    export_calendar_id: c ? (c.calendar_id === 'primary' ? primaryOf(c) : c.calendar_id) : null,
    can_list_calendars: c?.can_list_calendars ?? false,
    last_sync_at: c?.last_sync_at ?? null, last_error: c?.last_error ?? null,
  })

  try {
    // ----- расписание: синхронизировать всех -----
    const cronHeader = (req.headers.get('x-cron-secret') ?? '').trim()
    if (cronHeader) {
      const secret = env('CRON_SECRET').trim()
      if (!secret || !safeEqual(cronHeader, secret)) return new Response('forbidden', { status: 403, headers: CORS })
      const { data } = await sb.from('google_connections').select('*')
      const out = { users: 0, changed: 0, failed: 0, busy: 0 }
      for (const c of (data ?? []) as Conn[]) {
        out.users++
        try {
          const r = await syncOne(c)
          if ('busy' in r) out.busy++; else if (r.changed || r.pushed) out.changed++
        } catch (e) { out.failed++; console.error('sync failed', c.user_id, (e as Error).message) }
      }
      return json(out)
    }

    // ----- запрос из приложения -----
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u, error: uerr } = jwt ? await sb.auth.getUser(jwt) : { data: null, error: new Error('нет токена') }
    if (uerr || !u?.user) return json({ error: 'Нужно войти в приложение' }, 401)
    const userId = u.user.id

    if (action === 'status') return json(statusOf(await getConn(userId)))

    if (action === 'connect') {
      const code = String(body.code ?? ''), redirectUri = String(body.redirect_uri ?? '')
      if (!code || !redirectUri) return json({ error: 'Нет кода авторизации' }, 400)
      const t = await exchangeCode({ clientId, clientSecret, code, redirectUri })
      if (!t.refreshToken) return json({ error: 'Google не выдал постоянный доступ. Открой myaccount.google.com/permissions, удали доступ этого приложения и подключи заново.' }, 400)
      if (!t.scope.includes('calendar')) return json({ error: 'Не получен доступ к календарю: при входе поставь галочку «просмотр и редактирование событий».' }, 400)
      const up = await sb.from('google_connections').upsert({
        user_id: userId, refresh_token: t.refreshToken, google_email: t.email, can_list_calendars: t.scope.includes('calendar.calendarlist'), last_error: null, sync_lock_until: null, connected_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (up.error) throw new Error(up.error.message)
      // уже запланированные задачи со временем тоже отправляем в календарь
      const today = (await sb.rpc('local_today', { p_user: userId })).data as string
      await sb.from('tasks').update({ google_dirty: true }).eq('user_id', userId).gte('due_date', today)
        .not('start_time', 'is', null).is('google_event_id', null).neq('status', 'done')
      const conn = (await getConn(userId))!
      const rep = await syncOne(conn)
      return json({ ...statusOf(await getConn(userId)), report: rep })
    }

    const conn = await getConn(userId)

    if (action === 'disconnect') {
      if (conn) {
        await revokeToken(conn.refresh_token)
        await sb.from('google_connections').delete().eq('user_id', userId)
        await sb.from('google_tombstones').delete().eq('user_id', userId)
        await sb.from('google_ignored').delete().eq('user_id', userId)
        // связи с событиями сбрасываем: при повторном подключении всё свяжется заново
        await sb.from('tasks').update({ google_event_id: null, google_etag: null, google_all_day: false, google_dirty: false, google_calendar_id: null }).eq('user_id', userId).not('google_event_id', 'is', null)
      }
      return json(statusOf(null))
    }

    if (!conn) return json({ error: 'Google Календарь не подключён' }, 400)

    if (action === 'settings') {
      const upd: Record<string, unknown> = {}
      if (typeof body.import_events === 'boolean') upd.import_events = body.import_events
      const known = new Map((conn.calendars ?? []).map(c => [c.id, c]))
      if (Array.isArray(body.import_calendar_ids)) {
        const ids = [...new Set(body.import_calendar_ids.map(String))]
        if (known.size && ids.some(id => !known.has(id))) return json({ error: 'Неизвестный календарь' }, 400)
        upd.import_calendar_ids = ids
      }
      if (typeof body.export_calendar_id === 'string') {
        const c = known.get(body.export_calendar_id)
        if (known.size && (!c || !c.writable)) return json({ error: 'В этот календарь нельзя добавлять события' }, 400)
        upd.calendar_id = body.export_calendar_id
      }
      if (Object.keys(upd).length) {
        const r = await sb.from('google_connections').update(upd).eq('user_id', userId)
        if (r.error) throw new Error(r.error.message)
      }
      return json(statusOf(await getConn(userId)))
    }

    if (action === 'sync') {
      const rep = await syncOne(conn)
      return json({ ...statusOf(await getConn(userId)), report: rep })
    }
    return json({ error: 'Неизвестное действие: ' + action }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
