<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { WeekData } from '../types'
import { addDays, fmtMinutes, shortDate, weekStart } from '../lib/time'
import HabitTracker from '../components/HabitTracker.vue'

const app = useApp()
const ws = ref(weekStart(app.today))
const nextWs = computed(() => addDays(ws.value, 7))
const data = ref<WeekData | null>(null)
const loading = ref(false)
const busy = ref(false)
const wentWell = ref('')
const gotInWay = ref('')
const toChange = ref('')
const focus = ref('')
const nextGoals = ref<Record<string, number>>({}) // часы на следующую неделю

const saved = computed(() => app.reviewFor(ws.value))
const completed = computed(() => !!saved.value?.completed_at)
const isCurrent = computed(() => ws.value === weekStart(app.today))
const range = computed(() => `${shortDate(ws.value)} – ${shortDate(addDays(ws.value, 6))}`)
const history = computed(() => app.data.reviews.filter(r => r.completed_at).sort((a, b) => b.week_start.localeCompare(a.week_start)))

const diff = computed(() => (data.value ? data.value.total_minutes - data.value.prev_total_minutes : 0))
const habitPct = computed(() => (data.value?.habit_days_total ? Math.round((data.value.habit_days_done / data.value.habit_days_total) * 100) : null))
const pct = (m: number, goal: number) => (goal ? Math.min(100, Math.round((m / goal) * 100)) : 0)
const sphereColor = (id: string | null) => app.sphereById(id)?.color ?? '#B9B4A8'

async function loadWeek() {
  loading.value = true
  const r = saved.value
  const snap = r?.completed_at ? (r.snapshot as Partial<WeekData>) : null
  data.value = snap?.spheres ? (snap as WeekData) : ((await app.weekData(ws.value)) ?? null)
  wentWell.value = r?.went_well ?? ''; gotInWay.value = r?.got_in_way ?? ''; toChange.value = r?.to_change ?? ''
  focus.value = r?.focus_sphere_id ?? ''
  nextGoals.value = Object.fromEntries(app.spheres.map(s => [s.id, Math.round((app.goalFor(s.id, nextWs.value) / 60) * 100) / 100]))
  loading.value = false
}
watch(ws, loadWeek, { immediate: true })

const input = () => ({ went_well: wentWell.value.trim(), got_in_way: gotInWay.value.trim(), to_change: toChange.value.trim(), focus_sphere_id: focus.value || null })

async function saveDraft() {
  busy.value = true
  await app.saveReview(ws.value, input(), null, false)
  busy.value = false
}
async function complete() {
  busy.value = true
  // цели на следующую неделю: сохраняем только изменённые
  for (const s of app.spheres) {
    const minutes = Math.round((nextGoals.value[s.id] ?? 0) * 60)
    if (minutes !== app.goalFor(s.id, nextWs.value)) await app.setWeekGoal(s.id, nextWs.value, minutes, false)
  }
  const ok = await app.saveReview(ws.value, input(), data.value, true)
  busy.value = false
  if (ok) await loadWeek()
}
</script>

<template>
  <div class="mb-4 flex items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-bold">Итог недели</h1>
      <p class="text-sm text-mute">{{ range }}<span v-if="isCurrent"> · эта неделя</span></p>
    </div>
    <div class="flex gap-1">
      <button class="btn-ghost !px-3" aria-label="Предыдущая неделя" @click="ws = addDays(ws, -7)">‹</button>
      <button class="btn-ghost !px-3" aria-label="Следующая неделя" :disabled="isCurrent" @click="ws = addDays(ws, 7)">›</button>
    </div>
  </div>

  <p v-if="completed" class="mb-4 rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">✓ Неделя завершена. Итог сохранён, его можно дополнить.</p>
  <p v-else-if="isCurrent && new Date().getDay() !== 0" class="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Неделя ещё не закончилась — цифры обновятся, пока ты работаешь. Итог обычно подводят в воскресенье.</p>

  <div v-if="loading && !data" class="card p-8 text-center text-mute">Считаю…</div>
  <template v-else-if="data">
    <!-- Главные цифры -->
    <div class="mb-4 grid grid-cols-3 gap-2">
      <div class="card p-3">
        <div class="text-xs text-mute">Время</div>
        <div class="mt-1 text-lg font-bold leading-tight" data-test="total">{{ fmtMinutes(data.total_minutes) }}</div>
        <div class="mt-1 text-[11px]" :class="diff >= 0 ? 'text-accent' : 'text-amber-700'">
          {{ diff === 0 ? 'как на прошлой' : (diff > 0 ? '+' : '−') + fmtMinutes(Math.abs(diff)) + ' к прошлой' }}
        </div>
      </div>
      <div class="card p-3">
        <div class="text-xs text-mute">Задачи</div>
        <div class="mt-1 text-lg font-bold leading-tight" data-test="tasks">{{ data.tasks_done }}</div>
        <div class="mt-1 text-[11px] text-mute">выполнено за неделю</div>
      </div>
      <div class="card p-3">
        <div class="text-xs text-mute">Привычки</div>
        <div class="mt-1 text-lg font-bold leading-tight" data-test="habits">{{ habitPct === null ? '—' : habitPct + '%' }}</div>
        <div class="mt-1 text-[11px] text-mute">норма выполнена {{ data.habit_days_done }} из {{ data.habit_days_total }} раз</div>
      </div>
    </div>

    <HabitTracker :week-start="ws" />

    <!-- Сферы против целей -->
    <section class="mb-4">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Сферы</h2>
      <ul class="card divide-y divide-line">
        <li v-for="s in data.spheres" :key="s.sphere_id" class="px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ background: s.color }"></span>
            <span class="flex-1 font-medium">{{ s.name }}</span>
            <span class="text-sm font-semibold">{{ fmtMinutes(s.minutes) }}</span>
            <span v-if="s.goal_minutes && s.minutes >= s.goal_minutes" class="text-accent" title="Цель выполнена">✓</span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div class="h-full rounded-full" :style="{ width: pct(s.minutes, s.goal_minutes) + '%', background: s.color }"></div>
          </div>
          <div class="mt-1 text-xs text-mute">{{ s.goal_minutes ? `цель ${fmtMinutes(s.goal_minutes)} · ${pct(s.minutes, s.goal_minutes)}%` : 'цели не было' }}</div>
        </li>
      </ul>
    </section>

    <!-- На что ушло время -->
    <section v-if="data.top_time_tasks.length" class="mb-4">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">На что ушло больше всего времени</h2>
      <ul class="card divide-y divide-line">
        <li v-for="t in data.top_time_tasks" :key="t.task_id" class="flex items-center gap-3 px-4 py-2.5">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: sphereColor(t.sphere_id) }"></span>
          <span class="min-w-0 flex-1 truncate text-[15px]">{{ t.title }}</span>
          <span class="shrink-0 text-right text-xs">
            <span class="font-semibold">{{ fmtMinutes(t.spent_minutes) }}</span>
            <span v-if="t.estimate_minutes" class="block" :class="t.spent_minutes > t.estimate_minutes ? 'text-amber-700' : 'text-mute'">план {{ fmtMinutes(t.estimate_minutes) }}</span>
          </span>
        </li>
      </ul>
    </section>

    <!-- Вопросы -->
    <section class="mb-4 space-y-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-mute">Размышление</h2>
      <label class="block text-sm font-medium">Что получилось?
        <textarea v-model="wentWell" rows="2" class="input mt-1" placeholder="Чем довольна на этой неделе"></textarea></label>
      <label class="block text-sm font-medium">Что помешало?
        <textarea v-model="gotInWay" rows="2" class="input mt-1" placeholder="Что съело время и силы"></textarea></label>
      <label class="block text-sm font-medium">Что изменить?
        <textarea v-model="toChange" rows="2" class="input mt-1" placeholder="Одно-два небольших изменения"></textarea></label>
    </section>

    <!-- План на следующую неделю -->
    <section class="mb-5">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Следующая неделя · {{ shortDate(nextWs) }}</h2>
      <div class="card space-y-3 p-4">
        <label class="block text-sm font-medium">Главная сфера недели
          <select v-model="focus" class="input mt-1"><option value="">Не выбрана</option><option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option></select>
        </label>
        <div>
          <div class="mb-1.5 text-sm font-medium">Цели по времени, часов</div>
          <div v-for="s in app.spheres" :key="s.id" class="flex items-center gap-3 py-1">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ background: s.color }"></span>
            <span class="flex-1 text-sm">{{ s.name }}</span>
            <input v-model.number="nextGoals[s.id]" type="number" min="0" step="0.5" class="input !w-24" :aria-label="'Цель: ' + s.name" />
          </div>
          <p class="mt-1 text-xs text-mute">Меняются только на следующую неделю. Обычная цель сферы останется прежней.</p>
        </div>
      </div>
    </section>

    <div class="flex gap-2">
      <button class="btn-primary flex-1" :disabled="busy" @click="complete">{{ completed ? 'Обновить итог' : 'Завершить неделю' }}</button>
      <button class="btn-ghost" :disabled="busy" @click="saveDraft">Черновик</button>
    </div>
  </template>

  <section v-if="history.length" class="mt-8">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Прошлые итоги</h2>
    <ul class="card divide-y divide-line">
      <li v-for="r in history" :key="r.week_start">
        <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-bg" @click="ws = r.week_start">
          <span class="flex-1">{{ shortDate(r.week_start) }} – {{ shortDate(addDays(r.week_start, 6)) }}</span>
          <span class="text-mute">{{ fmtMinutes(r.snapshot.total_minutes ?? 0) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>
