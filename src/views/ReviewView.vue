<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { HabitDay, WeekData } from '../types'
import { addDays, fmtMinutes, shortDate, weekStart } from '../lib/time'
import HabitTracker from '../components/HabitTracker.vue'
import WeekPlanner from '../components/WeekPlanner.vue'
import SpherePlan from '../components/SpherePlan.vue'

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
const nextWork = ref(0) // часы работы на следующую неделю

const saved = computed(() => app.reviewFor(ws.value))
const completed = computed(() => !!saved.value?.completed_at)
const isCurrent = computed(() => ws.value === weekStart(app.today))
const range = computed(() => `${shortDate(ws.value)} – ${shortDate(addDays(ws.value, 6))}`)
const history = computed(() => app.data.reviews.filter(r => r.completed_at).sort((a, b) => b.week_start.localeCompare(a.week_start)))

const diff = computed(() => (data.value ? data.value.total_minutes - data.value.prev_total_minutes : 0))
const pct = (m: number, goal: number) => (goal ? Math.min(100, Math.round((m / goal) * 100)) : 0)

// ---- Бюджет времени следующей недели: 7 суток без сна, текучки и работы → сколько занято оценками задач, сколько свободно
const nextFree = computed(() => 7 * (1440 - app.timeBudget.sleep_minutes_per_day - app.timeBudget.routine_minutes_per_day) - Math.round((nextWork.value || 0) * 60))
/** Задачи следующей недели — те же, что считает полоска дней в планировании (без выполненных и «Входящих») */
const nextTasks = computed(() => {
  const end = addDays(nextWs.value, 6)
  return app.data.tasks.filter(t => t.due_date && t.due_date >= nextWs.value && t.due_date <= end && t.status !== 'done' && t.status !== 'inbox')
})
const nextNoEstimate = computed(() => nextTasks.value.filter(t => !t.estimate_minutes).length)
/** Привычки следующей недели: время есть только у привычек «на время» — норма минут × запланированные дни */
const nextHabitDays = ref<HabitDay[]>([])
watch([nextWs, () => app.data.habits, () => app.data.cycle], async () => {
  nextHabitDays.value = (await app.habitDays(nextWs.value, addDays(nextWs.value, 6))) ?? []
}, { immediate: true, deep: true })
const nextHabitMinutes = computed(() => {
  const m = new Map<string, number>()
  for (const d of nextHabitDays.value) {
    const h = app.data.habits.find(x => x.id === d.habit_id)
    if (h?.kind === 'timer' && d.scheduled) m.set(h.sphere_id, (m.get(h.sphere_id) ?? 0) + d.target)
  }
  return m
})
/** Привычки без времени (раз в день / отметка) в часы не попадают — сколько таких запланировано на неделе */
const nextHabitsNoTime = computed(() => new Set(nextHabitDays.value.filter(d => d.scheduled && app.data.habits.find(x => x.id === d.habit_id)?.kind !== 'timer').map(d => d.habit_id)).size)
/** Разбивка занятого по сферам: задачи + привычки; сначала сферы по порядку, в конце задачи без сферы */
const nextBySphere = computed(() => {
  const tasks = new Map<string | null, number>()
  for (const t of nextTasks.value) if (t.estimate_minutes) tasks.set(t.sphere_id, (tasks.get(t.sphere_id) ?? 0) + t.estimate_minutes)
  const habits = nextHabitMinutes.value
  const rows = app.spheres.filter(x => tasks.has(x.id) || habits.has(x.id)).map(x => {
    const tm = tasks.get(x.id) ?? 0, hm = habits.get(x.id) ?? 0
    return { id: x.id, name: x.name, color: x.color, tasks: tm, habits: hm, minutes: tm + hm, goal: Math.round((nextGoals.value[x.id] ?? 0) * 60) }
  })
  const rest = [...tasks].filter(([id]) => !rows.some(r => r.id === id)).reduce((sum, [, v]) => sum + v, 0)
  if (rest) rows.push({ id: '-', name: 'Без сферы', color: '#B9B4A8', tasks: rest, habits: 0, minutes: rest, goal: 0 })
  return rows
})
const nextBooked = computed(() => nextBySphere.value.reduce((sum, r) => sum + r.minutes, 0))
const nextLeft = computed(() => nextFree.value - nextBooked.value)
const bookedOpen = ref(false)
/** Раскрытые сферы в «Целях по времени»: под сферой — её задачи на следующую неделю и добавление новых */
const openSpheres = ref<Record<string, boolean>>({})
const plannedOf = (id: string) => nextBySphere.value.find(r => r.id === id)?.minutes ?? 0

async function loadWeek() {
  loading.value = true
  const r = saved.value
  // Сохранённый снимок цифр показываем только для прошедших недель. Пока неделя идёт, цифры живые: дела, сделанные после «Завершить неделю», тоже считаются
  const snap = r?.completed_at && !isCurrent.value ? (r.snapshot as Partial<WeekData>) : null
  data.value = snap?.spheres ? (snap as WeekData) : ((await app.weekData(ws.value)) ?? null)
  wentWell.value = r?.went_well ?? ''; gotInWay.value = r?.got_in_way ?? ''; toChange.value = r?.to_change ?? ''
  focus.value = r?.focus_sphere_id ?? ''
  nextWork.value = Math.round((app.workFor(nextWs.value) / 60) * 100) / 100
  nextGoals.value = Object.fromEntries(app.spheres.map(s => [s.id, Math.round((app.goalFor(s.id, nextWs.value) / 60) * 100) / 100]))
  loading.value = false
}
watch(ws, loadWeek, { immediate: true })
// потянули вниз — обновить цифры недели (ответы в полях не трогаем)
watch(() => app.refreshTick, async () => {
  if (saved.value?.completed_at && !isCurrent.value) return
  data.value = (await app.weekData(ws.value)) ?? data.value
})

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
  // часы работы на следующую неделю: сохраняем явно, даже если совпали с прошлой (так видно, что их подтвердили)
  const wm = Math.round((nextWork.value || 0) * 60)
  if (app.timeBudgetReady && (wm !== app.workFor(nextWs.value) || !app.hasOwnWork(nextWs.value))) await app.setWeekWork(nextWs.value, wm)
  // в снимок кладём свежие цифры, а не те, что были на экране при открытии
  const fresh = (await app.weekData(ws.value)) ?? data.value
  const ok = await app.saveReview(ws.value, input(), fresh, true)
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

  <p v-if="completed" class="mb-4 rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">✓ Неделя завершена. Итог сохранён, его можно дополнить.<span v-if="isCurrent" class="block font-normal">Неделя ещё идёт: цифры ниже живые. Чтобы сохранённый итог тоже обновился, нажми «Обновить итог».</span></p>
  <p v-else-if="isCurrent && new Date().getDay() !== 0" class="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Неделя ещё не закончилась — цифры обновятся, пока ты работаешь. Итог обычно подводят в воскресенье.</p>

  <div v-if="loading && !data" class="card p-8 text-center text-mute">Считаю…</div>
  <template v-else-if="data">
    <!-- Главные цифры -->
    <div class="mb-4 grid grid-cols-2 gap-2">
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

    <!-- План на следующую неделю -->
    <section class="mb-5">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Следующая неделя · {{ shortDate(nextWs) }}</h2>
      <div class="card space-y-3 p-4">
        <!-- Бюджет времени: сколько часов реально есть и сколько уже занято задачами -->
        <div class="rounded-xl bg-bg p-3 text-sm" data-test="next-budget">
          <div class="flex items-baseline justify-between gap-3">
            <span>Всего свободно</span><span class="font-semibold" data-test="nb-free">{{ fmtMinutes(Math.max(0, nextFree)) }}</span>
          </div>
          <p class="text-[11px] text-mute">7 дней без сна, текучки и работы ({{ fmtMinutes(Math.round((nextWork || 0) * 60)) }}, поле ниже)</p>
          <button type="button" class="mt-2 flex w-full items-baseline justify-between gap-3 text-left" :aria-expanded="bookedOpen" data-test="nb-booked" @click="bookedOpen = !bookedOpen">
            <span>На задачи и привычки занято <span class="inline-block text-mute transition-transform" :class="bookedOpen && 'rotate-180'">▾</span></span>
            <span class="font-semibold">{{ fmtMinutes(nextBooked) }}</span>
          </button>
          <ul v-if="bookedOpen" class="mt-1 space-y-1 border-l-2 border-line pl-3" data-test="nb-spheres">
            <li v-for="r in nextBySphere" :key="r.id" class="flex items-center gap-2 text-[13px]">
              <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: r.color }"></span>
              <span class="min-w-0 flex-1">{{ r.name }}
                <span v-if="r.habits" class="block text-[11px] text-mute">{{ r.tasks ? 'задачи ' + fmtMinutes(r.tasks) + ' · ' : '' }}привычки {{ fmtMinutes(r.habits) }}</span>
              </span>
              <span class="font-medium">{{ fmtMinutes(r.minutes) }}</span>
              <span v-if="r.goal" class="w-20 text-right text-[11px]" :class="r.minutes > r.goal ? 'text-amber-700' : 'text-mute'">цель {{ fmtMinutes(r.goal) }}</span>
            </li>
            <li v-if="!nextBySphere.length" class="text-[13px] text-mute">Задач с оценкой времени и привычек «на время» на следующей неделе пока нет.</li>
            <li v-if="nextNoEstimate" class="text-[11px] text-mute">Задач без оценки времени: {{ nextNoEstimate }} — их часы здесь не учтены.</li>
            <li v-if="nextHabitsNoTime" class="text-[11px] text-mute">Привычек без времени (раз в день, отметка): {{ nextHabitsNoTime }} — не учтены.</li>
          </ul>
          <div class="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2">
            <span>{{ nextLeft >= 0 ? 'Не распределено' : 'Перебор' }}</span>
            <span class="font-semibold" :class="nextLeft >= 0 ? 'text-accent' : 'text-amber-700'" data-test="nb-left">{{ fmtMinutes(Math.abs(nextLeft)) }}</span>
          </div>
        </div>
        <label class="block text-sm font-medium">Главная сфера недели
          <select v-model="focus" class="input mt-1"><option value="">Не выбрана</option><option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option></select>
        </label>
        <label class="flex items-center gap-3 text-sm font-medium" data-test="next-work">
          <span class="flex-1">Работа на следующей неделе, часов
            <span class="block text-xs font-normal text-mute">Вычитается из свободного времени на экране «Сферы». Если работа — отдельная сфера с таймером, поставь 0.</span>
          </span>
          <input v-model.number="nextWork" type="number" min="0" max="168" step="0.5" class="input !w-24" aria-label="Часы работы на следующей неделе" />
        </label>
        <div>
          <div class="mb-1.5 text-sm font-medium">Цели по времени, часов</div>
          <template v-for="s in app.spheres" :key="s.id">
            <div class="flex items-center gap-3 py-1">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: s.color }"></span>
              <button type="button" class="min-w-0 flex-1 text-left text-sm hover:text-accent" :aria-expanded="!!openSpheres[s.id]" data-test="sphere-toggle"
                @click="openSpheres[s.id] = !openSpheres[s.id]">
                {{ s.name }} <span class="inline-block text-mute transition-transform" :class="openSpheres[s.id] && 'rotate-180'">▾</span>
                <span class="block text-[11px]" :class="plannedOf(s.id) > (nextGoals[s.id] ?? 0) * 60 ? 'text-amber-700' : 'text-mute'">запланировано {{ fmtMinutes(plannedOf(s.id)) }}</span>
              </button>
              <input v-model.number="nextGoals[s.id]" type="number" min="0" step="0.5" class="input !w-24 shrink-0" :aria-label="'Цель: ' + s.name" />
            </div>
            <SpherePlan v-if="openSpheres[s.id]" :sphere-id="s.id" :week-start="nextWs" :habit-minutes="nextHabitMinutes.get(s.id)" />
          </template>
          <p class="mt-1 text-xs text-mute">Цели меняются только на следующую неделю, обычная цель сферы останется прежней. Нажми на сферу, чтобы увидеть её задачи на неделю и добавить новые.</p>
        </div>
      </div>
    </section>

    <!-- Планирование следующей недели: входящие, отложенное, проекты → дни недели -->
    <WeekPlanner v-if="nextWs >= weekStart(app.today)" :week-start="nextWs" />

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
