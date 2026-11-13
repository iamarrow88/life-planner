/**
 * Модули, которые можно выключить в ⚙ «Настройках». Выключенный модуль пропадает из интерфейса везде,
 * но его данные остаются в базе: включишь снова — всё на месте.
 * В базе хранится список отметок: «key» — модуль выключен; «+key» — включён модуль, который по умолчанию выключен (defaultOff).
 * Поэтому новый обычный модуль по умолчанию включён, а defaultOff — выключен, пока его не включат.
 */
export const MODULES = [
  { key: 'diary', label: 'Дневник', hint: 'вкладка «Дневник»; итог недели тогда открывается с экрана «Сферы»' },
  { key: 'budget', label: 'Бюджет задач', hint: 'поле «Бюджет, BYN» в карточке, сумма в строке задачи и сводка на «Сегодня»' },
  { key: 'priority', label: 'Приоритет задач', hint: 'три цветных кружка в карточке задачи и пастельная подсветка строки', defaultOff: true },
  { key: 'complexity', label: 'Сложность и перегруз', hint: 'шарик сложности у задачи и строка «День перегружен»' },
  { key: 'cycle', label: 'Календарь цикла', hint: 'отметка «М», день цикла и таблетки на «Сегодня»' },
  { key: 'books', label: 'Библиотека', hint: 'раздел в «Списках» и «Отправить в библиотеку» у задачи' },
  { key: 'movies', label: 'Фильмы', hint: 'раздел в «Списках» и «Отправить в фильмы» у задачи' },
  { key: 'wishes', label: 'Мои желания', hint: 'раздел в «Списках» и «Сделать желанием» у задачи' },
  { key: 'shopping', label: 'Список покупок', hint: 'раздел в «Списках» и «Добавить в список покупок» у задачи' },
  { key: 'monthly', label: 'Ежемесячный чек-лист', hint: 'раздел в «Списках»' },
] as const

export type ModuleKey = (typeof MODULES)[number]['key']
/** Отметка в базе: «key» — выключен, «+key» — включён модуль из выключенных по умолчанию */
export type ModuleFlag = ModuleKey | `+${ModuleKey}`
export const isDefaultOff = (k: ModuleKey) => MODULES.some(m => m.key === k && 'defaultOff' in m && m.defaultOff)

/** Разделы «Списков» (и не только) и модули, которым они принадлежат: выключенный модуль закрывает и свою страницу */
export const MODULE_ROUTES: Record<string, ModuleKey> = {
  '/library': 'books', '/movies': 'movies', '/wishes': 'wishes', '/shopping': 'shopping', '/monthly': 'monthly', '/today/cycle': 'cycle', '/diary': 'diary',
}

const LOCAL_KEY = 'planner.hiddenModules'
const known = new Set<string>(MODULES.flatMap(m => [m.key, '+' + m.key]))
export const cleanModules = (list: readonly string[] | null | undefined): ModuleFlag[] => [...new Set((list ?? []).filter(k => known.has(k)))] as ModuleFlag[]
/** Включён ли модуль при таком списке отметок */
export const moduleOn = (flags: readonly string[], k: ModuleKey) => (isDefaultOff(k) ? flags.includes('+' + k) : !flags.includes(k))

/** Пока в базе нет колонки hidden_modules (не выполнен planner_modules.sql), выбор хранится на устройстве */
export function readLocalModules(): ModuleFlag[] {
  try { return cleanModules(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]')) } catch { return [] }
}
export function writeLocalModules(list: ModuleFlag[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)) } catch { /* не страшно: выбор просто не запомнится */ }
}
