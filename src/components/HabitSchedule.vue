<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import type { HabitSchedule, RecurrenceFreq, RecurrenceMode } from '../types'
import { describeHabit } from '../lib/habitSchedule'

/** Расписание привычки или повторяющейся задачи (kind='task'): «каждые N …», дни недели, от какой даты отсчитывать. Свёрнуто до одной строки с описанием */
const props = defineProps<{ modelValue: HabitSchedule; startOpen?: boolean; kind?: 'habit' | 'task' }>()
const emit = defineEmits<{ 'update:modelValue': [v: HabitSchedule] }>()
const app = useApp()
const open = ref(props.startOpen)
const set = (patch: Partial<HabitSchedule>) => emit('update:modelValue', { ...props.modelValue, ...patch })
const v = computed(() => props.modelValue)

const freqs: { v: RecurrenceFreq; label: string }[] = [
  { v: 'day', label: 'День' }, { v: 'week', label: 'Неделя' }, { v: 'month', label: 'Месяц' }, { v: 'year', label: 'Год' },
]
const modes: { v: RecurrenceMode; label: string }[] = [
  { v: 'schedule', label: 'От планируемой даты' }, { v: 'after_completion', label: 'От дня выполнения' },
]
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const isodow = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return ((new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7) + 1 }

function pickFreq(f: RecurrenceFreq) {
  // «Неделя» со всеми семью днями — это просто «каждый день»: предлагаем один день недели, который пользователь выберет сам
  const wd = f === 'week' && v.value.weekdays.length === 7 ? [isodow(v.value.starts_on ?? app.today)] : v.value.weekdays
  set({ freq: f, weekdays: wd })
}
const toggleDay = (i: number) => set({ weekdays: v.value.weekdays.includes(i) ? v.value.weekdays.filter(x => x !== i) : [...v.value.weekdays, i].sort() })
const summary = computed(() => describeHabit(v.value))
const needDays = computed(() => v.value.freq === 'week' && v.value.mode === 'schedule')
</script>

<template>
  <div class="rounded-2xl border border-line bg-white p-3" data-test="habit-schedule">
    <button type="button" class="flex w-full items-center justify-between gap-2 text-left text-sm" :aria-expanded="open" @click="open = !open">
      <span><span class="text-mute">Повтор: </span><span class="font-medium" data-test="schedule-summary">{{ summary }}</span></span>
      <span class="text-mute">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-if="open" class="mt-3 space-y-3">
      <div>
        <div class="mb-1.5 flex items-center gap-2">
          <span class="text-sm text-mute">Каждые</span>
          <input :value="v.interval_n" type="number" min="1" max="366" class="input !w-20" aria-label="Интервал повтора"
            @input="e => set({ interval_n: Math.min(366, Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value) || 1))) })" />
        </div>
        <div class="grid grid-cols-4 gap-1.5">
          <button v-for="f in freqs" :key="f.v" type="button" class="chip justify-center px-0 py-2" :class="v.freq === f.v && 'chip-on'" :aria-pressed="v.freq === f.v" @click="pickFreq(f.v)">{{ f.label }}</button>
        </div>
      </div>

      <div v-if="needDays">
        <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mute">В какие дни</div>
        <div class="flex gap-1.5">
          <button v-for="(d, i) in WD" :key="d" type="button" class="chip flex-1 justify-center px-0 py-2" :class="v.weekdays.includes(i + 1) && 'chip-on'" :aria-pressed="v.weekdays.includes(i + 1)" @click="toggleDay(i + 1)">{{ d }}</button>
        </div>
        <p v-if="!v.weekdays.length" class="mt-1 text-xs text-red-700">Выбери хотя бы один день.</p>
      </div>

      <div>
        <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mute">Откуда отсчитывать</div>
        <div class="flex gap-1.5">
          <button v-for="m in modes" :key="m.v" type="button" class="chip flex-1 justify-center py-2 text-sm" :class="v.mode === m.v && 'chip-on'" :aria-pressed="v.mode === m.v" @click="set({ mode: m.v })">{{ m.label }}</button>
        </div>
        <p class="mt-1.5 text-xs text-mute">
          <template v-if="kind === 'task'">{{ v.mode === 'schedule'
            ? 'Задачи заранее появляются по календарю от даты начала, даже если прошлая не сделана.'
            : 'Следующая задача появится через интервал после того дня, когда отметишь текущую выполненной.' }}</template>
          <template v-else>{{ v.mode === 'schedule'
            ? 'Дни заранее зафиксированы от даты начала. Если пропустила день, расписание не сдвигается.'
            : 'Следующий раз — через интервал после того дня, когда привычка выполнена. Пока не выполнена, она остаётся в списке «Сегодня».' }}</template>
        </p>
      </div>

      <label class="block text-xs text-mute">{{ v.mode === 'schedule' ? 'Отсчёт от даты' : 'Первый раз' }}
        <input :value="v.starts_on ?? ''" type="date" class="input mt-1" aria-label="Дата начала"
          @input="e => set({ starts_on: (e.target as HTMLInputElement).value || null })" />
      </label>
    </div>
  </div>
</template>
