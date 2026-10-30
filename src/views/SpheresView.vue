<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import AutoTextarea from '../components/AutoTextarea.vue'
import { fmtMinutes, shortDate, weekStart, addDays, monthStart } from '../lib/time'
import { budgetRing, type Arc } from '../lib/timeBudget'

const app = useApp()
const COLORS = ['#3E8E5F', '#7B5CC4', '#D9783A', '#2F6DB3', '#C0475F', '#B58B1F']
const adding = ref(false)
const period = ref<'week' | 'month'>('week')
const minutesBy = computed(() => (period.value === 'week' ? app.weekMinutes : app.monthMinutes))
const name = ref('')
const color = ref(COLORS[0])
const goalHours = ref(5)
const description = ref('')

const total = computed(() => app.spheres.reduce((s, x) => s + (minutesBy.value[x.id] ?? 0), 0))

// ---- Бюджет времени: всё кольцо — время периода без сна, текучки и работы
const periodDays = computed(() => {
  const from = period.value === 'week' ? weekStart(app.today) : monthStart(app.today)
  const [y, m] = from.split('-').map(Number)
  const n = period.value === 'week' ? 7 : new Date(y, m, 0).getDate()
  return Array.from({ length: n }, (_, i) => addDays(from, i))
})
/** Недельные величины (цели, работа) за период: раскладываем по дням, чтобы месяц считался честно */
const perPeriod = (weekly: (week: string) => number) => periodDays.value.reduce((sum, d) => sum + weekly(weekStart(d)) / 7, 0)
const sleepTotal = computed(() => periodDays.value.length * app.timeBudget.sleep_minutes_per_day)
const routineTotal = computed(() => periodDays.value.length * app.timeBudget.routine_minutes_per_day)
const workTotal = computed(() => perPeriod(app.workFor))
const capacity = computed(() => periodDays.value.length * 1440 - sleepTotal.value - routineTotal.value - workTotal.value)
/** Какая доля периода уже прошла: сон, текучка и работа считаются равномерно по дням */
const elapsed = computed(() => {
  const start = new Date(periodDays.value[0] + 'T00:00:00').getTime()
  return Math.min(1, Math.max(0, (app.now - start) / (periodDays.value.length * 86400000)))
})
const availableNow = computed(() => Math.max(0, capacity.value * elapsed.value))
const untracked = computed(() => Math.max(0, availableNow.value - total.value))
const trackedPct = computed(() => (availableNow.value > 0 ? Math.min(100, Math.round((total.value / availableNow.value) * 100)) : 0))
const planOf = (id: string) => perPeriod(w => app.goalFor(id, w))
const ring = computed(() => budgetRing(capacity.value, app.spheres.map(x => ({ id: x.id, color: x.color, goal: planOf(x.id), spent: minutesBy.value[x.id] ?? 0 }))))
const sumGoals = computed(() => app.spheres.reduce((sum, x) => sum + planOf(x.id), 0))
const R = 70, C = 2 * Math.PI * R, RO = 86, CO = 2 * Math.PI * RO
/** Дуга на окружности длиной circ: минуты переводим в длину штриха */
const arcStyle = (a: Arc, circ: number, gap = 0) => {
  const k = circ / capacity.value
  return { 'stroke-dasharray': `${Math.max(0, a.len * k - gap)} ${circ}`, 'stroke-dashoffset': -a.from * k }
}
const hrs = (min: number) => fmtMinutes(Math.round(min))
// ---- Наведение на сектор подсвечивает сферу в списке (и наоборот), клик открывает страницу сферы
const router = useRouter()
const hovered = ref<string | null>(null)
/** id сферы дуги: у факта в нераспределённой части ключ «id:free» */
const sid = (a: Arc) => a.key.split(':')[0]
const arcCls = (a: Arc) => ['cursor-pointer transition-[opacity,stroke-width] duration-200', hovered.value && sid(a) !== hovered.value && 'opacity-30']
const arcWidth = (a: Arc, base: number) => (sid(a) === hovered.value ? base + 4 : base)
const openSphere = (id: string) => router.push('/spheres/' + id)
const perDayH = (min: number) => `${Math.round((min / 60) * 10) / 10} ч`

// ---- Часы работы этой недели (их же спрашивает итог недели на следующую)
const workEditing = ref(false)
const workHours = ref(0)
function editWork() { workEditing.value = true; workHours.value = Math.round((app.workFor(weekStart(app.today)) / 60) * 100) / 100 }
async function saveWork() { if (await app.setWeekWork(weekStart(app.today), (workHours.value || 0) * 60)) workEditing.value = false }
const range = computed(() => {
  if (period.value === 'month') return `с ${shortDate(monthStart(app.today))}`
  const w = weekStart(app.today); return `${shortDate(w)} – ${shortDate(addDays(w, 6))}`
})
const goalEditing = ref<string | null>(null)
const goalEditHours = ref(0)
const goalScope = ref<'week' | 'default'>('week')
const hasWeekOwnGoal = (id: string) => app.data.weekGoals.some(g => g.sphere_id === id && g.week_start === weekStart(app.today))
/** Открытые задачи сферы — для подписи на ссылке в карточку */
const openTasksOf = (id: string) => app.data.tasks.filter(t => t.sphere_id === id && t.status !== 'done').length
function editGoal(id: string) {
  goalEditing.value = id; goalEditHours.value = Math.round((app.goalFor(id) / 60) * 100) / 100; goalScope.value = 'week'
}
async function saveGoal(id: string) {
  const ok = await app.setWeekGoal(id, weekStart(app.today), (goalEditHours.value || 0) * 60, goalScope.value === 'default')
  if (ok) goalEditing.value = null
}
const pct = (id: string, goal: number) => (goal ? Math.min(100, Math.round(((app.weekMinutes[id] ?? 0) / goal) * 100)) : 0)

async function save() {
  if (!name.value.trim()) return
  const ok = await app.addSphere(name.value.trim(), color.value, Math.round(goalHours.value * 60), description.value)
  if (ok) { name.value = ''; description.value = ''; adding.value = false }
}
</script>

<template>
  <div class="mb-4 flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold">Сферы</h1>
      <p class="text-sm text-mute">{{ period === 'week' ? 'Неделя' : 'Месяц' }}: {{ range }}</p>
    </div>
    <button class="btn-ghost" @click="adding = !adding">{{ adding ? 'Закрыть' : '+ Сфера' }}</button>
  </div>

  <form v-if="adding" class="card mb-4 space-y-3 p-4" @submit.prevent="save">
    <input v-model="name" class="input" placeholder="Название сферы" maxlength="80" required autofocus />
    <AutoTextarea v-model="description" :min-rows="2" :maxlength="2000" placeholder="Описание сферы (необязательно)" />
    <div class="flex flex-wrap items-center gap-2">
      <button v-for="c in COLORS" :key="c" type="button" class="h-8 w-8 rounded-full ring-offset-2" :class="color === c && 'ring-2 ring-ink'" :style="{ background: c }" :aria-label="'Цвет ' + c" @click="color = c"></button>
      <input v-model="color" type="color" class="h-8 w-8 cursor-pointer rounded-full border border-line bg-white p-0.5" aria-label="Свой цвет" title="Свой цвет" />
    </div>
    <label class="flex items-center gap-3 text-sm text-mute">Цель на неделю, часов
      <input v-model.number="goalHours" type="number" min="0" step="0.5" class="input !w-24" />
    </label>
    <button class="btn-primary w-full">Создать</button>
  </form>

  <!-- Бюджет времени: кольцо — свободное время периода (без сна, текучки и работы) -->
  <div class="card mb-4 p-5" data-test="time-budget">
    <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
      <div class="relative h-[190px] w-[190px] shrink-0">
        <svg width="190" height="190" viewBox="0 0 190 190" class="-rotate-90" aria-hidden="true">
          <circle cx="95" cy="95" :r="R" fill="none" stroke="#E5E1D8" stroke-width="18" />
          <template v-if="capacity > 0">
            <circle v-for="a in ring.plan" :key="'p' + a.key" cx="95" cy="95" :r="R" fill="none" :stroke="a.color" stroke-opacity="0.22" :stroke-width="arcWidth(a, 10)" v-bind="arcStyle(a, C, 1.5)"
              :class="arcCls(a)" data-test="ring-arc" @mouseenter="hovered = sid(a)" @mouseleave="hovered = null" @click="openSphere(sid(a))" />
            <circle v-for="a in ring.fact" :key="'f' + a.key" cx="95" cy="95" :r="R" fill="none" :stroke="a.color" :stroke-width="arcWidth(a, 18)" v-bind="arcStyle(a, C)"
              :class="arcCls(a)" data-test="ring-arc" @mouseenter="hovered = sid(a)" @mouseleave="hovered = null" @click="openSphere(sid(a))" />
            <circle v-for="a in ring.over" :key="'o' + a.key" cx="95" cy="95" :r="RO" fill="none" :stroke="a.color" :stroke-width="arcWidth(a, 6)" v-bind="arcStyle(a, CO)"
              :class="arcCls(a)" data-test="ring-arc" @mouseenter="hovered = sid(a)" @mouseleave="hovered = null" @click="openSphere(sid(a))" />
          </template>
        </svg>
        <div class="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <div class="text-2xl font-bold leading-tight" data-test="untracked" :title="hrs(untracked)">{{ untracked < 60 ? hrs(untracked) : Math.round(untracked / 60) + ' ч' }}</div>
          <div class="text-[11px] leading-tight text-mute">не учтено<br />к этому моменту</div>
        </div>
      </div>

      <div class="w-full min-w-0 flex-1">
        <div class="mb-3 inline-flex rounded-xl border border-line bg-white p-0.5 text-xs font-medium">
          <button class="rounded-lg px-3 py-1" :class="period === 'week' ? 'bg-accent text-white' : 'text-mute'" @click="period = 'week'">Неделя</button>
          <button class="rounded-lg px-3 py-1" :class="period === 'month' ? 'bg-accent text-white' : 'text-mute'" @click="period = 'month'">Месяц</button>
        </div>
        <dl class="grid grid-cols-2 gap-2 text-center sm:text-left">
          <div class="rounded-xl bg-bg p-2"><dt class="text-[11px] text-mute">Учтено по сферам</dt><dd class="font-semibold" data-test="tracked">{{ hrs(total) }} <span class="text-xs font-normal text-mute">· {{ trackedPct }}%</span></dd></div>
          <div class="rounded-xl bg-bg p-2"><dt class="text-[11px] text-mute">Доступно к этому моменту</dt><dd class="font-semibold">~{{ hrs(availableNow) }}</dd></div>
          <div class="rounded-xl bg-bg p-2"><dt class="text-[11px] text-mute">Свободно за {{ period === 'week' ? 'неделю' : 'месяц' }}</dt><dd class="font-semibold" data-test="capacity">{{ hrs(Math.max(0, capacity)) }}</dd></div>
          <div class="rounded-xl bg-bg p-2"><dt class="text-[11px] text-mute">Цели сфер</dt><dd class="font-semibold">{{ hrs(sumGoals) }}</dd></div>
        </dl>
        <ul class="mt-3 space-y-1 text-sm">
          <li v-for="x in app.spheres" :key="x.id" class="flex cursor-pointer items-center gap-2" :data-hovered="hovered === x.id || undefined"
            @mouseenter="hovered = x.id" @mouseleave="hovered = null" @click="openSphere(x.id)">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full transition-transform duration-200" :class="hovered === x.id && 'scale-110'" :style="{ background: x.color }"></span>
            <span class="min-w-0 flex-1 origin-left truncate transition-all duration-200" :class="hovered === x.id ? 'font-semibold' : hovered && 'opacity-60'" :style="hovered === x.id ? { color: x.color } : undefined">{{ x.name }}</span>
            <span class="shrink-0 text-xs text-mute"><span class="font-semibold text-ink">{{ hrs(minutesBy[x.id] ?? 0) }}</span> / {{ planOf(x.id) ? hrs(planOf(x.id)) : 'без цели' }}</span>
          </li>
          <li v-if="ring.free" class="flex items-center gap-2 text-mute">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-line"></span>
            <span class="flex-1">Не распределено целями</span>
            <span class="shrink-0 text-xs">{{ hrs(ring.free.len) }}</span>
          </li>
        </ul>
      </div>
    </div>

    <p v-if="capacity <= 0" class="mt-3 text-xs text-amber-700">Сон, текучка и работа занимают всё время периода — проверь значения ниже.</p>
    <p v-else-if="ring.overGoals" class="mt-3 text-xs text-amber-700" data-test="over-goals">Целей на {{ hrs(sumGoals) }}, а свободно {{ hrs(capacity) }} — сектора сфер ужаты пропорционально. Стоит пересмотреть цели.</p>
    <p v-if="ring.over.length" class="mt-2 text-xs text-mute">Тонкое внешнее кольцо — время сверх целей, на которое уже не хватило нераспределённого.</p>

    <div class="mt-3 border-t border-line pt-3 text-xs text-mute">
      Из {{ hrs(periodDays.length * 1440) }} вычтено: сон {{ perDayH(app.timeBudget.sleep_minutes_per_day) }}/день · текучка {{ perDayH(app.timeBudget.routine_minutes_per_day) }}/день
      (<RouterLink to="/more" class="font-semibold text-accent">изменить</RouterLink>) ·
      работа {{ hrs(workTotal) }}<template v-if="period === 'week'">
        <button v-if="!workEditing" type="button" class="ml-1 font-semibold text-accent" data-test="work-edit" @click="editWork">✎</button></template>
      <form v-if="workEditing" class="mt-2 flex items-center gap-2" @submit.prevent="saveWork">
        <label class="flex items-center gap-2">Работа на этой неделе, часов
          <input v-model.number="workHours" type="number" min="0" max="168" step="0.5" class="input !w-24 !py-1.5" aria-label="Часы работы на этой неделе" />
        </label>
        <button class="btn-primary !px-3 !py-1.5">OK</button>
        <button type="button" class="btn-ghost !px-3 !py-1.5" @click="workEditing = false">Отмена</button>
      </form>
      <p v-if="!workTotal && !workEditing" class="mt-1">Если работу учитываешь таймером в отдельной сфере — оставь 0.</p>
      <p v-if="!app.timeBudgetReady" class="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">Сон, текучка и часы работы пока не сохраняются: выполни <code>planner_time_budget.sql</code> в Supabase (SQL Editor). Сейчас расчёт идёт по значениям по умолчанию.</p>
    </div>
  </div>

  <ul class="space-y-3">
    <li v-for="s in app.spheres" :key="s.id" class="card p-4">
      <div class="flex items-center gap-3">
        <span class="h-3 w-3 shrink-0 rounded-full" :style="{ background: s.color }"></span>
        <RouterLink :to="'/spheres/' + s.id" class="min-w-0 flex-1 truncate font-semibold hover:text-accent" :title="'Открыть сферу ' + s.name">{{ s.name }} <span class="text-mute">›</span></RouterLink>
        <button class="text-xs font-semibold text-mute hover:text-accent" @click="app.openEditor({ sphere_id: s.id }, s.name)">Править время</button>
        <button class="rounded-full px-3 py-1 text-xs font-semibold transition"
          :class="app.running?.sphere_id === s.id && !app.running?.task_id && !app.running?.habit_id ? 'bg-accent text-white' : 'bg-accent-soft text-accent'"
          @click="app.running?.sphere_id === s.id && !app.running?.task_id && !app.running?.habit_id ? app.stopTimer() : app.startTimer({ sphere_id: s.id })">
          {{ app.running?.sphere_id === s.id && !app.running?.task_id && !app.running?.habit_id ? 'Стоп' : '▶ Таймер' }}
        </button>
      </div>
      <p v-if="s.description" class="mt-2 whitespace-pre-line break-words text-sm text-mute" data-test="sphere-desc">{{ s.description }}</p>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-line">
        <div class="h-full rounded-full transition-all" :style="{ width: pct(s.id, app.goalFor(s.id)) + '%', background: s.color }"></div>
      </div>
      <div class="mt-1.5 flex justify-between text-xs text-mute">
        <span>неделя {{ fmtMinutes(Math.round(app.weekMinutes[s.id] ?? 0)) }} · месяц {{ fmtMinutes(Math.round(app.monthMinutes[s.id] ?? 0)) }}</span>
        <button class="font-medium text-accent" @click="editGoal(s.id)">
          <template v-if="app.goalFor(s.id)">цель {{ fmtMinutes(app.goalFor(s.id)) }} · {{ pct(s.id, app.goalFor(s.id)) }}%<span v-if="hasWeekOwnGoal(s.id)" title="Цель только для этой недели"> ✎</span></template>
          <template v-else>задать цель</template>
        </button>
      </div>
      <form v-if="goalEditing === s.id" class="mt-3 space-y-2 rounded-xl bg-bg p-3" @submit.prevent="saveGoal(s.id)">
        <label class="flex items-center gap-3 text-sm text-mute">Цель на неделю, часов
          <input v-model.number="goalEditHours" type="number" min="0" step="0.5" class="input !w-24" />
        </label>
        <div class="flex gap-2">
          <button type="button" class="chip flex-1 justify-center py-2" :class="goalScope === 'week' && 'chip-on'" @click="goalScope = 'week'">Только эта неделя</button>
          <button type="button" class="chip flex-1 justify-center py-2" :class="goalScope === 'default' && 'chip-on'" @click="goalScope = 'default'">По умолчанию</button>
        </div>
        <p class="text-xs text-mute">{{ goalScope === 'week' ? 'Новая цель действует только на эту неделю, дальше вернётся обычная.' : 'Новая цель станет обычной для этой и следующих недель.' }}</p>
        <div class="flex gap-2">
          <button class="btn-primary flex-1">Сохранить</button>
          <button type="button" class="btn-ghost" @click="goalEditing = null">Отмена</button>
        </div>
      </form>

      <RouterLink :to="'/spheres/' + s.id" class="mt-3 flex items-center border-t border-line pt-3 text-sm font-semibold text-accent" data-test="sphere-open">
        <span class="flex-1">Задачи {{ openTasksOf(s.id) }} · проекты {{ app.projectsOf(s.id).length }} · привычки {{ app.data.habits.filter(h => h.sphere_id === s.id).length }}</span>
        <span>Открыть ›</span>
      </RouterLink>
    </li>
  </ul>
  <p v-if="!app.spheres.length" class="card p-8 text-center text-mute">Создай первую сферу: здоровье, хобби, семья…</p>
</template>
