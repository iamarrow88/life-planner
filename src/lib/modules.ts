/**
 * Модули, которые можно выключить во «Ещё». Выключенный модуль пропадает из интерфейса везде,
 * но его данные остаются в базе: включишь снова — всё на месте.
 * В базе хранится список ВЫКЛЮЧЕННЫХ модулей, поэтому новый модуль по умолчанию включён.
 */
export const MODULES = [
  { key: 'budget', label: 'Бюджет задач', hint: 'поле «Бюджет, BYN» в карточке, сумма в строке задачи и сводка на «Сегодня»' },
  { key: 'complexity', label: 'Сложность и перегруз', hint: 'шарик сложности у задачи и строка «День перегружен»' },
  { key: 'cycle', label: 'Календарь цикла', hint: 'отметка «М», день цикла и таблетки на «Сегодня»' },
  { key: 'books', label: 'Библиотека', hint: 'раздел в «Разном» и «Отправить в библиотеку» у задачи' },
  { key: 'movies', label: 'Фильмы', hint: 'раздел в «Разном» и «Отправить в фильмы» у задачи' },
  { key: 'wishes', label: 'Мои желания', hint: 'раздел в «Разном» и «Сделать желанием» у задачи' },
  { key: 'shopping', label: 'Список покупок', hint: 'раздел в «Разном» и «Добавить в список покупок» у задачи' },
  { key: 'monthly', label: 'Ежемесячный чек-лист', hint: 'раздел в «Разном»' },
] as const

export type ModuleKey = (typeof MODULES)[number]['key']

/** Разделы «Разного» и модули, которым они принадлежат: выключенный модуль закрывает и свою страницу */
export const MODULE_ROUTES: Record<string, ModuleKey> = {
  '/library': 'books', '/movies': 'movies', '/wishes': 'wishes', '/shopping': 'shopping', '/monthly': 'monthly', '/today/cycle': 'cycle',
}

const LOCAL_KEY = 'planner.hiddenModules'
const known = new Set<string>(MODULES.map(m => m.key))
export const cleanModules = (list: readonly string[] | null | undefined): ModuleKey[] => [...new Set((list ?? []).filter(k => known.has(k)))] as ModuleKey[]

/** Пока в базе нет колонки hidden_modules (не выполнен planner_modules.sql), выбор хранится на устройстве */
export function readLocalModules(): ModuleKey[] {
  try { return cleanModules(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]')) } catch { return [] }
}
export function writeLocalModules(list: ModuleKey[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)) } catch { /* не страшно: выбор просто не запомнится */ }
}
