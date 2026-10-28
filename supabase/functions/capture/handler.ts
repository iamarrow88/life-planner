// Быстрый ввод задачи во «Входящие» по личному ключу (для часов). Чистая логика — отдельно, чтобы тестировать без Deno.
export const MAX_TITLE = 500
export const MAX_PER_MINUTE = 30

export interface CaptureStore {
  /** user_id по отпечатку ключа или null */
  userByHash(hash: string): Promise<string | null>
  touch(userId: string): Promise<void>
  recentCount(userId: string, sinceIso: string): Promise<number>
  /** true — создана, false — такая задача (по id) уже есть */
  insert(userId: string, row: { id?: string; title: string }): Promise<boolean>
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function capture(store: CaptureStore, authHeader: string | null, body: unknown, now = Date.now()): Promise<{ status: number; json: Record<string, unknown> }> {
  const m = /^Bearer\s+(plw_[0-9a-f]{64})$/i.exec((authHeader ?? '').trim())
  if (!m) return { status: 401, json: { error: 'Нужен ключ ввода (Authorization: Bearer plw_…)' } }
  const userId = await store.userByHash(await sha256Hex(m[1]))
  if (!userId) return { status: 401, json: { error: 'Ключ не подходит или отозван. Создай новый в «Ещё → Часы».' } }
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const title = typeof b.title === 'string' ? b.title.replace(/\s+/g, ' ').trim() : ''
  if (!title) return { status: 400, json: { error: 'Пустой текст задачи' } }
  if (title.length > MAX_TITLE) return { status: 400, json: { error: `Слишком длинный текст (больше ${MAX_TITLE} символов)` } }
  const id = typeof b.id === 'string' && UUID.test(b.id) ? b.id : undefined
  if (await store.recentCount(userId, new Date(now - 60_000).toISOString()) >= MAX_PER_MINUTE) return { status: 429, json: { error: 'Слишком много задач за минуту' } }
  const created = await store.insert(userId, { id, title })
  await store.touch(userId)
  return { status: 200, json: { ok: true, duplicate: !created } }
}
