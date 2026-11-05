// Supabase отдаёт не больше 1000 строк за запрос и молча обрезает остальное, поэтому большие таблицы читаем порциями.
// Запрос страницы должен быть упорядочен по уникальной колонке: иначе строки на границе порций могут потеряться или повториться.

export const PAGE_SIZE = 1000

/** Все строки по страницам. При ошибке — та же ошибка, что у обычного запроса, без частичных данных */
export async function fetchAllPages<T, E>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>,
): Promise<{ data: T[] | null; error: E | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error || !data) return { data: null, error }
    rows.push(...data)
    if (data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
