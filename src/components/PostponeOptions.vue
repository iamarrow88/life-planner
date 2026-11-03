<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp, type PostponeKind } from '../stores/app'
import type { Task } from '../types'
import { hhmm, shortDate } from '../lib/time'

/** Варианты переноса задачи: завтра, на выходные, на следующую неделю, своя дата и время. Меню в строке задачи и окно из уведомления */
const props = defineProps<{ task: Task }>()
const emit = defineEmits<{ close: [] }>()
const app = useApp()
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const dayName = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return `${WD[new Date(y, m - 1, dd).getDay()]}, ${shortDate(d)}` }
const options = computed(() => ([['tomorrow', 'Завтра'], ['weekend', 'На выходные'], ['nextweek', 'На следующую неделю']] as const)
  .map(([kind, label]) => ({ kind, label, to: app.postponeTarget(kind) })))
async function postpone(kind: PostponeKind) { emit('close'); await app.postponeTask(props.task.id, kind) }
/** «Выбрать…»: своя дата и время (по умолчанию — завтра, время задачи) */
const choosing = ref(false)
const customDate = ref('')
const customTime = ref('')
function startChoose() { choosing.value = true; customDate.value = app.postponeTarget('tomorrow'); customTime.value = hhmm(props.task.start_time) }
async function postponeCustom() {
  if (!customDate.value) return
  emit('close')
  await app.postponeTask(props.task.id, { date: customDate.value, time: customTime.value })
}
</script>

<template>
  <button v-for="o in options" :key="o.kind" type="button" role="menuitem" class="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent-soft"
    :data-test="'postpone-' + o.kind" @click="postpone(o.kind)">
    <span class="whitespace-nowrap">{{ o.label }}</span><span class="whitespace-nowrap text-xs text-mute">{{ dayName(o.to) }}</span>
  </button>
  <button v-if="!choosing" type="button" role="menuitem" class="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent-soft" data-test="postpone-choose" @click="startChoose">
    <span class="whitespace-nowrap">Выбрать…</span><span class="whitespace-nowrap text-xs text-mute">дата и время</span>
  </button>
  <form v-else class="space-y-2 border-t border-line px-2 pb-1 pt-2" data-test="postpone-custom" @submit.prevent="postponeCustom">
    <div class="flex gap-1.5">
      <input v-model="customDate" type="date" class="input min-w-0 flex-1 !px-2 !py-1.5 !text-sm" :min="app.today" required aria-label="Новая дата" />
      <input v-model="customTime" type="time" class="input !w-24 !px-2 !py-1.5 !text-sm" aria-label="Время (необязательно)" title="Пусто — без времени" />
    </div>
    <button class="btn-primary w-full !py-1.5 !text-sm" :disabled="!customDate">Перенести</button>
  </form>
  <p v-if="task.start_time && !choosing" class="px-3 pb-1 pt-0.5 text-[11px] text-mute">Время {{ hhmm(task.start_time) }} сохранится</p>
</template>
