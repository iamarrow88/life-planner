<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { addDays, fmtMinutes, shortDate } from '../lib/time'
import type { Task } from '../types'
import TaskRow from './TaskRow.vue'
import EstimateInput from './EstimateInput.vue'
import ComplexityPicker from './ComplexityPicker.vue'

/**
 * Задачи сферы на неделю (в итоге недели, под целью сферы): что уже запланировано по дням
 * и быстрое добавление новой задачи сразу в эту сферу — с днём, временем и длительностью.
 * Ниже (свёрнуто) — задачи сферы из «Входящих» и «Отложено без даты»: их можно сразу поставить на день недели
 */
const props = defineProps<{ sphereId: string; weekStart: string; habitMinutes?: number }>()
const app = useApp()
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(props.weekStart, i)))
const dayLabel = (d: string) => `${WD[days.value.indexOf(d)] ?? ''} ${shortDate(d)}`

const tasks = computed(() => {
  const end = addDays(props.weekStart, 6)
  return app.data.tasks
    .filter(t => t.sphere_id === props.sphereId && t.due_date && t.due_date >= props.weekStart && t.due_date <= end && t.status !== 'inbox')
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
})
const isDone = (t: Task) => t.status === 'done'

/** Кандидаты на неделю: задачи этой сферы во «Входящих» и в «Отложено без даты» */
const pool = computed(() => [
  ...app.inbox.filter(t => t.sphere_id === props.sphereId).map(t => ({ t, from: 'входящие' })),
  ...app.deferred.filter(t => t.sphere_id === props.sphereId).map(t => ({ t, from: 'отложено' })),
])
const poolOpen = ref(false)
function onPick(t: Task, e: Event) {
  const el = e.target as HTMLSelectElement
  const v = el.value; el.value = '-'
  if (v !== '-') void app.updateTask(t.id, { due_date: v, status: 'planned' })
}

const title = ref('')
const day = ref(props.weekStart)
const time = ref('')
const estimate = ref<number | null>(null)
const complexity = ref<number | null>(null)
const busy = ref(false)
async function add() {
  const name = title.value.trim(); if (!name || busy.value) return
  busy.value = true
  await app.addTask({ title: name, status: 'planned', sphere_id: props.sphereId, due_date: day.value, start_time: time.value ? `${time.value}:00` : null, estimate_minutes: estimate.value, complexity: complexity.value })
  busy.value = false
  // день оставляем: удобно добавить несколько задач подряд на один день
  title.value = ''; time.value = ''; estimate.value = null; complexity.value = null
}
</script>

<template>
  <div class="mb-2 ml-5 overflow-hidden rounded-xl border border-line bg-white" data-test="sphere-plan">
    <ul v-if="tasks.length" class="divide-y divide-line">
      <li v-for="t in tasks" :key="t.id">
        <TaskRow :task="t" no-timer>
          <span class="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium" :class="isDone(t) ? 'text-mute' : 'text-ink/80'">{{ dayLabel(t.due_date!) }}</span>
        </TaskRow>
      </li>
    </ul>
    <p v-else class="px-3 py-2.5 text-xs text-mute">На эту неделю задач в сфере пока нет.</p>
    <p v-if="habitMinutes" class="border-t border-line px-3 py-2 text-xs text-mute">+ привычки «на время»: {{ fmtMinutes(habitMinutes) }} за неделю</p>
    <div v-if="pool.length" class="border-t border-line" data-test="sphere-pool">
      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-mute hover:text-accent" :aria-expanded="poolOpen" @click="poolOpen = !poolOpen">
        <span class="flex-1">Из входящих и отложенных · {{ pool.length }}</span>
        <span class="inline-block transition-transform" :class="poolOpen && 'rotate-180'">▾</span>
      </button>
      <ul v-if="poolOpen" class="divide-y divide-line border-t border-line bg-bg/50">
        <li v-for="p in pool" :key="p.t.id">
          <TaskRow :task="p.t" no-timer>
            <span class="hidden shrink-0 text-[11px] text-mute sm:inline">{{ p.from }}</span>
            <select class="input !w-12 shrink-0 !px-1.5 !py-1 !text-sm" :aria-label="'Поставить на день: ' + p.t.title" title="Поставить на день недели" @change="onPick(p.t, $event)">
              <option value="-">📅</option>
              <option v-for="d in days" :key="d" :value="d">{{ dayLabel(d) }}</option>
            </select>
          </TaskRow>
        </li>
      </ul>
    </div>
    <form class="flex flex-wrap items-center gap-2 border-t border-line p-2" @submit.prevent="add">
      <input v-model="title" class="input min-w-[10rem] flex-1 !py-1.5 !text-sm" placeholder="Новая задача в сферу" aria-label="Новая задача" />
      <select v-model="day" class="input !w-auto !py-1.5 !text-sm" aria-label="День">
        <option v-for="d in days" :key="d" :value="d">{{ dayLabel(d) }}</option>
      </select>
      <input v-model="time" type="time" class="input !w-auto !py-1.5 !text-sm" aria-label="Время (необязательно)" title="Время (необязательно)" />
      <EstimateInput v-model="estimate" class="!py-1.5 !text-sm" />
      <ComplexityPicker v-model="complexity" />
      <button class="btn-primary !px-3 !py-1.5 !text-sm" :disabled="!title.trim() || busy">Добавить</button>
    </form>
  </div>
</template>
