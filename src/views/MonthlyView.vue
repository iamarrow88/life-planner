<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { vDragSort } from '../lib/dragSort'
import MonthlyCard from '../components/MonthlyCard.vue'

/** Ежемесячный чек-лист: дела раз в месяц, в любой день. 1-го числа всё снова не отмечено; в общий список задач пункты сами не попадают */
const app = useApp()
const text = ref('')
const monthName = computed(() => {
  const [y, m] = app.thisMonth.split('-').map(Number)
  const name = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long' })
  return name[0].toUpperCase() + name.slice(1)
})
const doneCount = computed(() => app.monthlyItems.filter(app.monthlyDone).length)
const total = computed(() => app.monthlyItems.length)
const pct = computed(() => (total.value ? Math.round((doneCount.value / total.value) * 100) : 0))
async function add() {
  const title = text.value.trim(); if (!title) return
  if (await app.addMonthlyItem(title)) text.value = ''
}
</script>

<template>
  <RouterLink to="/misc" class="mb-3 inline-block text-sm font-semibold text-accent">‹ Разное</RouterLink>
  <h1 class="mb-1 text-2xl font-bold">Ежемесячный чек-лист</h1>
  <p class="mb-4 text-sm text-mute">Дела раз в месяц, в любой день. 1-го числа всё снова станет не отмеченным.</p>

  <p v-if="!app.monthlyReady" class="card mb-4 bg-amber-50 p-4 text-sm text-amber-900" data-test="monthly-not-ready">Чтобы сохранять чек-лист, выполни <code>planner_monthly.sql</code> в Supabase (SQL Editor) и обнови страницу.</p>
  <template v-else>
    <form class="mb-4 flex gap-2" @submit.prevent="add">
      <input v-model="text" class="input min-w-0 flex-1" maxlength="300" placeholder="Что делать раз в месяц?" aria-label="Новый пункт" data-test="monthly-input" />
      <button class="btn-primary shrink-0" :disabled="!text.trim()">Добавить</button>
    </form>

    <div v-if="!total" class="card p-8 text-center text-mute" data-test="monthly-empty">Добавь первое дело: например, оплатить счета или купить что-то в дом</div>
    <template v-else>
      <div class="mb-2 flex items-baseline justify-between text-sm" data-test="monthly-progress">
        <span class="font-semibold">{{ monthName }}</span>
        <span class="text-mute">{{ doneCount === total ? 'всё сделано ✓' : 'сделано ' + doneCount + ' из ' + total }}</span>
      </div>
      <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-line"><div class="h-full rounded-full bg-accent transition-all" :style="{ width: pct + '%' }"></div></div>
      <div v-drag-sort="(ids: string[]) => app.reorderMonthlyItems(ids)" class="card divide-y divide-line" data-test="monthly-list">
        <MonthlyCard v-for="i in app.monthlyItems" :key="i.id" :data-id="i.id" :item="i" />
      </div>
    </template>
  </template>
</template>
