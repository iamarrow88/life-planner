import { computed, ref, watch } from 'vue'

/** Отбор задач: сфера и проект ('' — все, 'none' — без сферы / без проекта, иначе id) и тег ('' — все) */
export interface TaskFilter { sphere: string; project: string; tag: string }
export const NONE = 'none'
export const EMPTY_FILTER: TaskFilter = { sphere: '', project: '', tag: '' }

/** Подходит ли задача (или правило повтора) под отбор */
export function matchesFilter(f: TaskFilter, t: { sphere_id: string | null; project_id?: string | null; tags?: string[] }): boolean {
  if (f.tag && !t.tags?.includes(f.tag)) return false
  if (!f.sphere) return true
  if (f.sphere === NONE) return !t.sphere_id
  if (t.sphere_id !== f.sphere) return false
  if (!f.project) return true
  return f.project === NONE ? !t.project_id : t.project_id === f.project
}

/** Отбор экрана: свой для каждого экрана (key), запоминается на этом устройстве */
export function useTaskFilter(key: string) {
  const storeKey = 'kola-filter-' + key
  let initial = EMPTY_FILTER
  try { initial = { ...EMPTY_FILTER, ...(JSON.parse(localStorage.getItem(storeKey) ?? 'null') ?? {}) } } catch { /* нет хранилища — без отбора */ }
  const filter = ref<TaskFilter>(initial)
  watch(filter, f => { try { localStorage.setItem(storeKey, JSON.stringify(f)) } catch { /* не запомним — не страшно */ } }, { deep: true })
  const active = computed(() => !!filter.value.sphere || !!filter.value.tag)
  const match = (t: { sphere_id: string | null; project_id?: string | null; tags?: string[] }) => matchesFilter(filter.value, t)
  /** Новая задача, созданная при включённом отборе, получает его сферу, проект и тег — и сразу видна в списке */
  const newTaskFields = () => {
    const f = filter.value, sphere = f.sphere && f.sphere !== NONE ? f.sphere : null
    return {
      ...(sphere ? { sphere_id: sphere, project_id: f.project && f.project !== NONE ? f.project : null } : {}),
      ...(f.tag ? { tags: [f.tag] } : {}),
    }
  }
  return { filter, active, match, newTaskFields }
}
