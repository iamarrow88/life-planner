// Вход через Google для синхронизации календаря (OAuth, схема «код авторизации»).
// Браузер уводит на страницу Google, Google возвращает на /more?code=…&state=…,
// а код обменивается на постоянный доступ уже на сервере (Edge Function google-sync) — секрет в браузер не попадает.

export const googleClientId = ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '').trim()
const STATE_KEY = 'planner-google-oauth-state'
const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly'

/** Адрес возврата (учитывает папку сайта, например /life-planner/more): его нужно добавить в «Authorized redirect URIs» в Google Cloud */
export const googleRedirectUri = () => `${window.location.origin}${import.meta.env.BASE_URL}more`

export function startGoogleLogin(): void {
  const state = crypto.randomUUID()
  try { sessionStorage.setItem(STATE_KEY, state) } catch { /* без хранилища проверить state не получится — продолжим без него */ }
  const p = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',   // нужен постоянный доступ, чтобы синхронизировать без тебя
    prompt: 'consent',        // Google выдаёт постоянный доступ только при явном согласии
    state,
  })
  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString()
}

export type GoogleCallback = { code: string } | { error: string } | null

/** Если страница открыта после возврата от Google — достаёт код (или ошибку) и убирает его из адреса */
export function takeGoogleCallback(): GoogleCallback {
  const q = new URLSearchParams(window.location.search)
  const code = q.get('code'), err = q.get('error'), state = q.get('state')
  if (!code && !err) return null
  let expected: string | null = null
  try { expected = sessionStorage.getItem(STATE_KEY); sessionStorage.removeItem(STATE_KEY) } catch { /* см. выше */ }
  window.history.replaceState(null, '', window.location.pathname)
  if (expected && state !== expected) return { error: 'Не совпал контрольный код входа. Попробуй подключить ещё раз.' }
  if (err) return { error: err === 'access_denied' ? 'Доступ не выдан: ты отменила вход в Google.' : `Google вернул ошибку: ${err}` }
  return { code: code! }
}
