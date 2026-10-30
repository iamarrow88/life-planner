<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useApp } from '../stores/app'
import { useBackdrop } from '../lib/backdrop'
import DestPicker from './DestPicker.vue'

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ close: [] }>()
const app = useApp()

type Dest = { sphere_id: string | null; project_id: string | null }
const project = computed(() => app.projectById(props.projectId))
const tasks = computed(() => app.data.tasks.filter(t => t.project_id === props.projectId && t.status !== 'done'))
// по умолчанию задача остаётся в той же сфере, но без проекта
const dest = reactive<Record<string, Dest>>({})
for (const t of app.data.tasks) if (t.project_id === props.projectId && t.status !== 'done') dest[t.id] = { sphere_id: project.value?.sphere_id ?? null, project_id: null }

const label = (d: Dest) => {
  const s = app.sphereById(d.sphere_id); const p = app.projectById(d.project_id)
  return s ? (p ? `${s.name} › ${p.name}` : `${s.name} (без проекта)`) : 'Без сферы'
}

/** Что сейчас раскрыто: 'all' («Перенести все…») или id задачи */
const open = ref<string | null>(null)
const toggle = (key: string) => { open.value = open.value === key ? null : key }
function place(key: string, d: Dest) {
  if (key === 'all') for (const t of tasks.value) dest[t.id] = { ...d }
  else dest[key] = { ...d }
  open.value = null
}

const busy = ref(false)
const bd = useBackdrop(() => emit('close'))
async function archive() {
  busy.value = true
  const moves = Object.fromEntries(tasks.value.map(t => [t.id, { ...dest[t.id] }]))
  const ok = await app.archiveProject(props.projectId, moves)
  busy.value = false
  if (ok) emit('close')
}
</script>

<template>
  <div v-if="project" class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" @pointerdown="bd.down" @click="bd.click">
    <div role="dialog" aria-label="Архивация проекта" class="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-bg p-5 md:rounded-3xl">
      <div class="flex items-start justify-between gap-3">
        <h2 class="min-w-0 break-words text-lg font-bold">В архив: «{{ project.name }}»</h2>
        <button type="button" class="text-2xl leading-none text-mute" aria-label="Закрыть" @click="emit('close')">×</button>
      </div>

      <p v-if="!tasks.length" class="text-sm text-mute">Незавершённых задач в проекте нет. Выполненные останутся как есть, а проект можно будет вернуть из архива.</p>
      <template v-else>
        <p class="text-sm text-mute">Незавершённых задач: <b data-test="arch-count">{{ tasks.length }}</b>. Выбери, куда их перенести. По умолчанию они остаются в той же сфере, но без проекта.</p>
        <div>
          <button type="button" class="chip w-full justify-center py-2 text-sm" :class="open === 'all' && 'chip-on'" @click="toggle('all')">Перенести все…</button>
          <DestPicker v-if="open === 'all'" class="mt-2" :exclude="projectId" @pick="d => place('all', d)" />
        </div>
        <ul class="divide-y divide-line rounded-2xl border border-line bg-white">
          <li v-for="t in tasks" :key="t.id" class="px-3 py-2.5" data-test="arch-task">
            <div class="break-words text-sm">{{ t.title }}</div>
            <button type="button" class="chip mt-1.5 max-w-full py-1 text-xs hover:chip-on" :class="open === t.id && 'chip-on'" :aria-label="'Куда перенести: ' + t.title" @click="toggle(t.id)">
              <span class="truncate">{{ label(dest[t.id]) }}</span><span>▾</span>
            </button>
            <DestPicker v-if="open === t.id" class="mt-2" :exclude="projectId" @pick="d => place(t.id, d)" />
          </li>
        </ul>
      </template>

      <div class="flex gap-2">
        <button type="button" class="btn-primary flex-1" :disabled="busy" @click="archive">Архивировать</button>
        <button type="button" class="btn-ghost" @click="emit('close')">Отмена</button>
      </div>
    </div>
  </div>
</template>
