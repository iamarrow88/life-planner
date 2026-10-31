<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { addDays, hhmm, shortDate } from '../lib/time'
import type { Dose, PillMark } from '../lib/cycle'

/**
 * Утренний вопрос: вчера был день курса, а таблетка не отмечена — правда пропустила?
 * «Приняла» отмечает приём задним числом, «Пропустила» записывает пустую отметку (0) — так вопрос больше не задаётся,
 * а в истории цикла доза остаётся пропущенной
 */
const app = useApp()
const yesterday = computed(() => addDays(app.today, -1))
const course = computed(() => app.pillCourseOn(yesterday.value))
const marks = ref<PillMark[] | null>(null)
const busy = ref(false)

async function load() {
  marks.value = null
  if (!course.value) return
  marks.value = (await app.pillMarks(yesterday.value, yesterday.value)) ?? null
}
watch(() => [yesterday.value, course.value?.id], load, { immediate: true })

const DOSES = [
  { dose: 'morning' as Dose, idKey: 'morning_habit_id' as const, timeKey: 'morning_time' as const, label: 'утренняя' },
  { dose: 'evening' as Dose, idKey: 'evening_habit_id' as const, timeKey: 'evening_time' as const, label: 'вечерняя' },
]
/** Дозы без всякой отметки за вчера (отметка 0 — уже ответили «пропустила») */
const pending = computed(() => {
  if (!marks.value) return []
  const s = app.cycleSettings
  return DOSES.flatMap(d => {
    const habit = app.data.habits.find(h => h.id === s[d.idKey])
    return habit && !marks.value!.some(m => m.dose === d.dose) ? [{ ...d, habit, time: hhmm(s[d.timeKey]) }] : []
  })
})

async function answer(list: typeof pending.value, took: boolean) {
  busy.value = true
  for (const p of list) if (!(await app.bumpHabit(p.habit, took ? 1 : -1, yesterday.value))) break
  await load()
  busy.value = false
}
</script>

<template>
  <div v-if="pending.length" class="card mb-4 border-amber-300 bg-amber-50 p-4 text-sm" data-test="pill-check">
    <p class="font-semibold">Вчера, {{ shortDate(yesterday) }}, {{ pending.length > 1 ? 'не отмечены таблетки' : `не отмечена ${pending[0].label} таблетка` }}. Ты {{ pending.length > 1 ? 'их' : 'её' }} пропустила?</p>
    <ul class="mt-2 space-y-2">
      <li v-for="p in pending" :key="p.dose" class="flex flex-wrap items-center gap-2" data-test="pill-check-row">
        <span class="min-w-0 flex-1">{{ p.habit.name }} <span class="text-mute">({{ p.time }})</span></span>
        <button type="button" class="chip py-1 text-sm hover:chip-on" :disabled="busy" data-test="pill-took" @click="answer([p], true)">Нет, приняла</button>
        <button type="button" class="chip py-1 text-sm" :disabled="busy" data-test="pill-missed" @click="answer([p], false)">Да, пропустила</button>
      </li>
    </ul>
    <button v-if="pending.length > 1" type="button" class="mt-2 text-xs font-semibold text-accent" :disabled="busy" data-test="pill-took-all" @click="answer(pending, true)">Приняла обе</button>
  </div>
</template>
