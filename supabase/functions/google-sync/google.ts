// Обращения к Google (OAuth и Calendar API). Только fetch — работает и в Deno, и в Node (для тестов).
import type { GEvent, GoogleApi } from './sync.ts'

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
export const GOOGLE_API = 'https://www.googleapis.com/calendar/v3'

export class GoogleAuthError extends Error { fatal = true }

export interface Urls { token?: string; revoke?: string; api?: string }

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))))
  } catch { return {} }
}

async function tokenRequest(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
  const j = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    const code = String(j.error ?? res.status)
    const msg = `Google: ${code}${j.error_description ? ' — ' + j.error_description : ''}`
    if (code === 'invalid_grant' || code === 'invalid_client' || code === 'unauthorized_client') throw new GoogleAuthError(msg)
    throw new Error(msg)
  }
  return j
}

/** Обмен одноразового кода на токены (после входа через Google в браузере) */
export async function exchangeCode(a: { clientId: string; clientSecret: string; code: string; redirectUri: string }, urls: Urls = {}) {
  const j = await tokenRequest(urls.token ?? GOOGLE_TOKEN_URL, {
    code: a.code, client_id: a.clientId, client_secret: a.clientSecret, redirect_uri: a.redirectUri, grant_type: 'authorization_code',
  })
  const email = typeof j.id_token === 'string' ? (decodeJwtPayload(j.id_token).email as string | undefined) ?? null : null
  return { refreshToken: (j.refresh_token as string | undefined) ?? null, accessToken: j.access_token as string, scope: String(j.scope ?? ''), email }
}

export async function refreshAccessToken(a: { clientId: string; clientSecret: string; refreshToken: string }, urls: Urls = {}): Promise<string> {
  const j = await tokenRequest(urls.token ?? GOOGLE_TOKEN_URL, {
    refresh_token: a.refreshToken, client_id: a.clientId, client_secret: a.clientSecret, grant_type: 'refresh_token',
  })
  return j.access_token as string
}

export async function revokeToken(token: string, urls: Urls = {}): Promise<void> {
  await fetch(urls.revoke ?? GOOGLE_REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }).catch(() => {})
}

export function calendarApi(accessToken: string, urls: Urls = {}): GoogleApi {
  const base = urls.api ?? GOOGLE_API
  const evUrl = (cal: string, id?: string, q?: Record<string, string>) =>
    `${base}/calendars/${encodeURIComponent(cal)}/events${id ? '/' + encodeURIComponent(id) : ''}${q ? '?' + new URLSearchParams(q) : ''}`

  async function call(method: string, url: string, body?: unknown): Promise<Response> {
    let res!: Response
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (res.status !== 429 && res.status < 500) break
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
    if (res.status === 401) throw new GoogleAuthError('Google отклонил доступ (401)')
    return res
  }
  async function failure(res: Response): Promise<Error> {
    const j = await res.json().catch(() => ({})) as { error?: { message?: string } }
    return new Error(`Google Calendar ${res.status}: ${j.error?.message ?? res.statusText}`)
  }
  const gone = (s: number) => s === 404 || s === 410

  return {
    async listEvents({ calendarId, timeMin, timeMax }) {
      const out: GEvent[] = []
      let pageToken = ''
      do {
        const q: Record<string, string> = { singleEvents: 'true', showDeleted: 'true', timeMin, timeMax, maxResults: '250' }
        if (pageToken) q.pageToken = pageToken
        const res = await call('GET', evUrl(calendarId, undefined, q))
        if (!res.ok) throw await failure(res)
        const j = await res.json() as { items?: GEvent[]; nextPageToken?: string }
        out.push(...(j.items ?? []))
        pageToken = j.nextPageToken ?? ''
      } while (pageToken)
      return out
    },
    async getEvent(cal, id) {
      const res = await call('GET', evUrl(cal, id))
      if (gone(res.status)) return null
      if (!res.ok) throw await failure(res)
      return await res.json() as GEvent
    },
    async insertEvent(cal, body) {
      const res = await call('POST', evUrl(cal, undefined, { sendUpdates: 'none' }), body)
      if (!res.ok) throw await failure(res)
      return await res.json() as GEvent
    },
    async patchEvent(cal, id, body) {
      const res = await call('PATCH', evUrl(cal, id, { sendUpdates: 'none' }), body)
      if (gone(res.status)) return null
      if (!res.ok) throw await failure(res)
      const ev = await res.json() as GEvent
      return ev.status === 'cancelled' ? null : ev
    },
    async deleteEvent(cal, id) {
      const res = await call('DELETE', evUrl(cal, id, { sendUpdates: 'none' }))
      if (!res.ok && !gone(res.status)) throw await failure(res)
    },
  }
}
