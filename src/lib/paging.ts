// Supabase отдаёт не больше 1000 строк за запрос и молча обрезает остальное, поэтому большие таблицы читаем порциями.
// Запрос страницы должен быть упорядочен по уникальной колонке: иначе строки на границе порций могут потеряться или повториться.

export const PAGE_SIZE = 1000
/** Сколько порций запрашивать одновременно: по одной было бы столько ожиданий ответа сервера подряд, сколько порций */
export const PAGES_AT_ONCE = 4

/**
 * Все строки по страницам. Первая порция — одна (обычно её и хватает); дальше — по PAGES_AT_ONCE сразу.
 * При ошибке — та же ошибка, что у обычного запроса, без частичных данных
 */
export async function fetchAllPages<T, E>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>,
): Promise<{ data: T[] | null; error: E | null }> {
  const rows: T[] = []
  const page = (n: number) => fetchPage(n * PAGE_SIZE, (n + 1) * PAGE_SIZE - 1)
  for (let n = 0, wave = 1; ; n += wave, wave = PAGES_AT_ONCE) {
    const results = await Promise.all(Array.from({ length: wave }, (_, i) => page(n + i)))
    for (const { data, error } of results) {
      if (error || !data) return { data: null, error }
      rows.push(...data)
      if (data.length < PAGE_SIZE) return { data: rows, error: null }
    }
  }
}
