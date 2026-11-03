import { computed, ref, watch } from 'vue'

/** Отбор задач по сфере и проекту: '' — все, 'none' — без сферы / без проекта, иначе id */
export interface TaskFilter { sphere: string; project: string }
export const NONE = 'none'
const EMPTY: TaskFilter = { sphere: '', project: '' }

/** Подходит ли задача (или правило повтора) под отбор */
export function matchesFilter(f: TaskFilter, t: { sphere_id: string | null; project_id?: string | null }): boolean {
  if (!f.sphere) return true
  if (f.sphere === NONE) return !t.sphere_id
  if (t.sphere_id !== f.sphere) return false
  if (!f.project) return true
  return f.project === NONE ? !t.project_id : t.project_id === f.project
}

/** Отбор экрана: свой для каждого экрана (key), запоминается на этом устройстве */
export function useTaskFilter(key: string) {
  const storeKey = 'kola-filter-' + key
  let initial = EMPTY
  try { initial = { ...EMPTY, ...(JSON.parse(localStorage.getItem(storeKey) ?? 'null') ?? {}) } } catch { /* нет хранилища — без отбора */ }
  const filter = ref<TaskFilter>(initial)
  watch(filter, f => { try { localStorage.setItem(storeKey, JSON.stringify(f)) } catch { /* не запомним — не страшно */ } }, { deep: true })
  const active = computed(() => !!filter.value.sphere)
  const match = (t: { sphere_id: string | null; project_id?: string | null }) => matchesFilter(filter.value, t)
  return { filter, active, match }
}
