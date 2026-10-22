// Логика отправки без привязки к Deno/Supabase — чтобы её можно было проверить тестом.

export interface Claimed { user_id: string; kind: string; title: string; body: string; url: string; tag: string }
export interface Sub { id: string; user_id: string; endpoint: string; p256dh: string; auth_key: string }

export interface Deps {
  /** Уведомления, которые пора отправить (claim_due_notifications) */
  claim(): Promise<Claimed[]>
  /** Подписки устройств этих пользователей */
  subscriptions(userIds: string[]): Promise<Sub[]>
  /** Отправка одному устройству; при ошибке бросает объект со statusCode */
  send(sub: Sub, payload: string): Promise<void>
  removeSubs(ids: string[]): Promise<void>
  touchSubs(ids: string[]): Promise<void>
}

export interface Report { claimed: number; sent: number; failed: number; removed: number }

export async function run(deps: Deps): Promise<Report> {
  const report: Report = { claimed: 0, sent: 0, failed: 0, removed: 0 }
  const items = await deps.claim()
  report.claimed = items.length
  if (!items.length) return report

  const userIds = [...new Set(items.map(i => i.user_id))]
  const subs = await deps.subscriptions(userIds)
  const byUser = new Map<string, Sub[]>()
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

  const dead = new Set<string>(), alive = new Set<string>()
  await Promise.all(items.flatMap(item =>
    (byUser.get(item.user_id) ?? []).map(async sub => {
      const payload = JSON.stringify({ title: item.title, body: item.body, url: item.url, tag: item.tag, kind: item.kind })
      try { await deps.send(sub, payload); report.sent++; alive.add(sub.id) }
      catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        // 404/410: подписка отозвана (приложение удалено, уведомления выключены) — убираем её
        if (code === 404 || code === 410) dead.add(sub.id)
        else { report.failed++; console.error('push failed', code, (e as Error).message) }
      }
    })))
  for (const id of dead) alive.delete(id)
  if (dead.size) { await deps.removeSubs([...dead]); report.removed = dead.size }
  if (alive.size) await deps.touchSubs([...alive])
  return report
}

/**
 * Админ-ключ Supabase для функции. В старых проектах он приходит как SUPABASE_SERVICE_ROLE_KEY,
 * в новых — в JSON-словаре SUPABASE_SECRET_KEYS (ключ «default» или первый). Можно задать и свой секрет SERVICE_KEY.
 */
export function resolveAdminKey(get: (name: string) => string | undefined): string {
  const custom = get('SERVICE_KEY') || get('SUPABASE_SERVICE_ROLE_KEY')
  if (custom) return custom
  const raw = get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const dict = JSON.parse(raw) as Record<string, string>
      return dict.default ?? Object.values(dict)[0] ?? ''
    } catch { /* не JSON — считаем, что ключа нет */ }
  }
  return ''
}
