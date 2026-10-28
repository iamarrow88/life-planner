// Админ-ключ Supabase для функции (копия из send-reminders: функции деплоятся независимо друг от друга)

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
