// Supabase Edge Function: добавить задачу во «Входящие» по личному ключу (приложение для часов).
// Деплой: npx supabase functions deploy capture --no-verify-jwt --use-api --project-ref REF
// Секретов не требует: SUPABASE_URL и ключ доступа к базе подставляет сам Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { resolveAdminKey } from './admin.ts'
import { capture, type CaptureStore } from './handler.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) => Response.json(body, { status, headers: CORS })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'Только POST' })
  const key = resolveAdminKey(Deno.env.get.bind(Deno.env))
  const url = Deno.env.get('SUPABASE_URL')
  if (!key || !url) return reply(500, { error: 'На сервере нет SUPABASE_URL или ключа доступа к базе' })
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const store: CaptureStore = {
    async userByHash(hash) {
      const r = await sb.from('capture_tokens').select('user_id').eq('token_hash', hash).maybeSingle()
      if (r.error) throw new Error(r.error.message)
      return r.data?.user_id ?? null
    },
    async touch(userId) { await sb.from('capture_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', userId) },
    async recentCount(userId, since) {
      const r = await sb.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since)
      if (r.error) throw new Error(r.error.message)
      return r.count ?? 0
    },
    async insert(userId, row) {
      const r = await sb.from('tasks').insert({ user_id: userId, title: row.title, status: 'inbox', ...(row.id ? { id: row.id } : {}) })
      if (r.error) {
        if (r.error.code === '23505') return false      // повторная отправка той же задачи (часы при плохой связи)
        throw new Error(r.error.message)
      }
      return true
    },
  }
  try {
    const body = await req.json().catch(() => null)
    const out = await capture(store, req.headers.get('authorization'), body)
    return reply(out.status, out.json)
  } catch (e) {
    console.error(e)
    return reply(500, { error: 'Ошибка сервера: ' + (e as Error).message })
  }
})
