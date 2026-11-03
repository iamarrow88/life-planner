<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { Habit, HabitDay } from '../types'
import { addDays, shortDate } from '../lib/time'

const props = defineProps<{ weekStart: string }>()
const app = useApp()
const week = ref<HabitDay[]>([])
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(props.weekStart, i)))

async function load() { week.value = (await app.habitDays(props.weekStart, addDays(props.weekStart, 6))) ?? [] }
watch(() => props.weekStart, load, { immediate: true })
// отметили привычку на «Сегодня» и вернулись — цифры должны совпадать
watch(() => app.data.habitEntries, load, { deep: true })
watch(() => app.data.habits, load)

// 'before' — день не считается: ещё не наступил, был до создания привычки или привычка в этот день не запланирована
type State = 'done' | 'part' | 'none' | 'future' | 'before'
interface Cell { day: string; value: number; state: State; scheduled: boolean }
const rows = computed(() => app.data.habits.map(h => {
  const mine = week.value.filter(x => x.habit_id === h.id)
  const target = h.target_value ?? 1
  const cells: Cell[] = days.value.map(d => {
    const x = mine.find(m => m.day === d)
    const value = x?.value ?? 0
    const scheduled = !!x?.scheduled
    const state: State = d > app.today ? 'future' : value >= target ? 'done' : !scheduled ? 'before' : value > 0 ? 'part' : 'none'
    return { day: d, value, state, scheduled }
  })
  return { habit: h, target, cells }
})
  // привычки, которые на этой неделе не были запланированы ни на один день (вне курса, другая неделя по расписанию)
  // и не выполнялись, в отчёт не попадают
  .filter(r => r.cells.some(c => c.scheduled || c.value > 0)))
const unit = (h: Habit) => (h.kind === 'timer' ? ' мин' : '')
const label = (h: Habit, c: Cell, target: number) => {
  const st = c.state === 'done' ? (c.scheduled ? 'выполнено' : 'выполнено (в этот день не было запланировано)')
      : c.state === 'part' ? `частично ${c.value} из ${target}${unit(h)}`
          : c.state === 'future' ? 'ещё впереди' : c.state === 'before' ? 'в этот день не запланировано' : 'не выполнено'
  return `${h.name}, ${shortDate(c.day)}: ${st}`
}
</script>


<template>
  <section v-if="rows.length" class="mb-4" data-test="habit-tracker">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Трекер привычек</h2>
    <!-- Таблица: слева название привычки, справа 7 клеток дней — всё одной строкой; сверху — дни недели -->
    <div class="card divide-y divide-line">
      <div class="grid grid-cols-[minmax(0,1fr)_repeat(7,1.75rem)] items-center px-4 py-2 text-[11px] text-mute sm:grid-cols-[minmax(0,1fr)_repeat(7,2.25rem)]">
        <span></span>
        <span v-for="(d, i) in days" :key="d" class="text-center" :class="d === app.today && 'font-bold text-accent'">{{ WD[i] }}</span>
      </div>
      <div v-for="r in rows" :key="r.habit.id" class="grid grid-cols-[minmax(0,1fr)_repeat(7,1.75rem)] items-center px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(7,2.25rem)]" data-test="habit-row">
        <span class="min-w-0 truncate pr-2 text-sm font-medium" :title="r.habit.name + (r.habit.kind !== 'plain' ? ` — ${r.target}${r.habit.kind === 'timer' ? ' мин' : ' раз'} в день` : '')">{{ r.habit.name }}<span v-if="r.habit.kind !== 'plain'" class="ml-1 text-[11px] font-normal text-mute">{{ r.target }}{{ r.habit.kind === 'timer' ? ' мин' : ' раз' }}</span></span>
        <template v-for="c in r.cells" :key="c.day">
          <span class="grid place-items-center">
            <span class="block h-3.5 w-3.5 rounded" role="img" :aria-label="label(r.habit, c, r.target)" :title="label(r.habit, c, r.target)" :data-state="c.state"
              :class="{
                'bg-accent': c.state === 'done' || c.state === 'part',
                'bg-line': c.state === 'none',
                'border border-dashed border-line': c.state === 'future' || c.state === 'before',
              }"
              :style="c.state === 'part' ? { opacity: 0.25 + 0.45 * Math.min(1, c.value / r.target) } : undefined"></span>
          </span>
        </template>
      </div>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
      <span class="inline-flex items-center gap-1"><span class="h-3 w-3 rounded bg-line"></span>нет</span>
      <span class="inline-flex items-center gap-1"><span class="h-3 w-3 rounded bg-accent opacity-50"></span>частично</span>
      <span class="inline-flex items-center gap-1"><span class="h-3 w-3 rounded bg-accent"></span>норма выполнена</span>
      <span class="inline-flex items-center gap-1"><span class="h-3 w-3 rounded border border-dashed border-line"></span>не считается (впереди или до создания)</span>
    </div>
  </section>
</template>
