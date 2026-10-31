<script setup lang="ts">
import { computed, ref } from 'vue'
import { addDays } from '../lib/time'

/**
 * Сетка месяца Пн–Вс: стрелки листают месяцы, по названию месяца — выбор месяца и года, «Сегодня» — к текущему месяцу.
 * Саму клетку дня рисует слот #day (d — дата 'YYYY-MM-DD', inMonth — день этого месяца, а не соседнего)
 */
const props = defineProps<{ today: string }>()
const month = defineModel<string>({ required: true }) // 'YYYY-MM'
defineSlots<{ day(p: { d: string; inMonth: boolean }): unknown }>()

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
const isodow = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return ((new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7) + 1 }
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

const title = computed(() => { const [y, m] = month.value.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) })
defineExpose({ shift: (n: number) => shift(n) })
function shift(n: number) {
  const [y, m] = month.value.split('-').map(Number)
  month.value = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}
const cells = computed(() => {
  const first = month.value + '-01'
  const lead = isodow(first) - 1
  const [y, m] = month.value.split('-').map(Number)
  const len = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const start = addDays(first, -lead)
  return Array.from({ length: Math.ceil((lead + len) / 7) * 7 }, (_, i) => addDays(start, i))
})

// ---- Выбор месяца и года
const picking = ref(false)
const pickYear = ref(Number(month.value.slice(0, 4)))
function openPicker() { pickYear.value = Number(month.value.slice(0, 4)); picking.value = !picking.value }
function pick(m: number) { month.value = ym(pickYear.value, m); picking.value = false }
function toToday() { month.value = props.today.slice(0, 7); picking.value = false }
</script>

<template>
  <div>
    <div class="mb-2 flex items-center gap-2">
      <button type="button" class="btn-ghost !px-3" aria-label="Предыдущий месяц" data-drag-month="-1" @click="shift(-1)">‹</button>
      <button type="button" class="flex-1 text-sm font-semibold first-letter:uppercase" :aria-expanded="picking" data-test="month-title" @click="openPicker">{{ title }} ▾</button>
      <button v-if="month !== today.slice(0, 7)" type="button" class="chip py-1 text-xs" data-test="month-today" @click="toToday">Сегодня</button>
      <button type="button" class="btn-ghost !px-3" aria-label="Следующий месяц" data-drag-month="1" @click="shift(1)">›</button>
    </div>
    <div v-if="picking" class="card mb-2 p-3" data-test="month-picker">
      <div class="mb-2 flex items-center justify-between text-sm font-semibold">
        <button type="button" class="btn-ghost !px-3 !py-1" aria-label="Предыдущий год" @click="pickYear--">‹</button>
        {{ pickYear }}
        <button type="button" class="btn-ghost !px-3 !py-1" aria-label="Следующий год" @click="pickYear++">›</button>
      </div>
      <div class="grid grid-cols-4 gap-1.5">
        <button v-for="(name, i) in MONTHS" :key="name" type="button" class="chip justify-center py-1.5 text-sm"
          :class="ym(pickYear, i + 1) === month && 'chip-on'" @click="pick(i + 1)">{{ name }}</button>
      </div>
    </div>
    <div class="card p-2">
      <div class="mb-1 grid grid-cols-7 text-center text-[11px] text-mute">
        <span v-for="w in WD" :key="w">{{ w }}</span>
      </div>
      <div class="grid grid-cols-7 gap-1">
        <template v-for="d in cells" :key="d"><slot name="day" :d="d" :inMonth="d.startsWith(month)" /></template>
      </div>
    </div>
  </div>
</template>
