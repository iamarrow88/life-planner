// Supabase Edge Function: отправляет push-напоминания. Вызывается раз в минуту (pg_cron → pg_net).
// Секреты (supabase secrets set ...): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
// SUPABASE_URL и ключ доступа к базе (SUPABASE_SECRET_KEYS / SUPABASE_SERVICE_ROLE_KEY) Supabase подставляет сам.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { resolveAdminKey, run, type Claimed, type Sub } from './handler.ts'

const env = (k: string) => Deno.env.get(k) ?? ''

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  const secret = env('CRON_SECRET')
  if (!secret || !safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) {
    return new Response('forbidden', { status: 403 })
  }
  const adminKey = resolveAdminKey(Deno.env.get.bind(Deno.env))
  const missing = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'SUPABASE_URL'].filter(k => !env(k))
  if (!adminKey) missing.push('ключ доступа к базе (SUPABASE_SECRET_KEYS или SERVICE_KEY)')
  if (missing.length) return Response.json({ error: 'Не заданы: ' + missing.join(', ') }, { status: 500 })

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  const sb = createClient(env('SUPABASE_URL'), adminKey, { auth: { persistSession: false } })

  try {
    const report = await run({
      async claim() {
        const { data, error } = await sb.rpc('claim_due_notifications')
        if (error) throw new Error(error.message)
        return (data ?? []) as Claimed[]
      },
      async subscriptions(userIds) {
        const { data, error } = await sb.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth_key').in('user_id', userIds)
        if (error) throw new Error(error.message)
        return (data ?? []) as Sub[]
      },
      async send(sub, payload) {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload,
          { TTL: 60 * 60 }, // если устройство выключено — доставить в течение часа
        )
      },
      async removeSubs(ids) { await sb.from('push_subscriptions').delete().in('id', ids) },
      async touchSubs(ids) { await sb.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).in('id', ids) },
    })
    return Response.json(report)
  } catch (e) {
    console.error(e)
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
})
