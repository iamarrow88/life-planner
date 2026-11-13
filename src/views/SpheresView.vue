<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import AutoTextarea from '../components/AutoTextarea.vue'
import NavIcon from '../components/NavIcon.vue'
import { fmtMinutes, shortDate, weekStart, addDays, monthStart } from '../lib/time'
import { factRing, planRing, type Arc } from '../lib/timeBudget'
import { vDragSort } from '../lib/dragSort'
import SphereWheel from '../components/SphereWheel.vue'
import SphereMigrate from '../components/SphereMigrate.vue'
import { LIFE_SPHERES, balanceScore, lifeByName } from '../lib/lifeSpheres'
import SettingsLink from '../components/SettingsLink.vue'
import Icon from '../components/Icon.vue'

const app = useApp()
const COLORS = computed(() => app.sphereColors)
const adding = ref(false)
/** Новая сфера: по умолчанию — первый цвет набора, которого ещё нет у других сфер */
function toggleAdding() {
  adding.value = !adding.value
  if (adding.value) color.value = COLORS.value.find(c => !app.spheres.some(s => s.color.toLowerCase() === c.toLowerCase())) ?? COLORS.value[0]
}
const period = ref<'week' | 'month'>('week')
const minutesBy = computed(() => (period.value === 'week' ? app.weekMinutes : app.monthMinutes))
const name = ref('')
const color = ref(COLORS.value[0])
const goalHours = ref(5)
const description = ref('')

// ---- Бюджет времени: время периода без сна, текучки и работы
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
const planOf = (id: string) => perPeriod(w => app.goalFor(id, w))
/** Какое кольцо показано: «План» или «Факт» (запоминается на этом устройстве) */
const RING_VIEW_KEY = 'kola-ring-view'
const ringView = ref<'plan' | 'fact'>((() => { try { return localStorage.getItem(RING_VIEW_KEY) === 'fact' ? 'fact' : 'plan' } catch { return 'plan' } })())
function setRingView(v: 'plan' | 'fact') { ringView.value = v; try { localStorage.setItem(RING_VIEW_KEY, v) } catch { /* без хранилища просто не запомним */ } }
/** Время без действующей сферы: отдельный сектор на кольце факта */
const OTHER_ID = 'other', OTHER_COLOR = '#B9B4A8'
const otherMinutes = computed(() => (period.value === 'week' ? app.otherWeekMinutes : app.otherMonthMinutes))
const ringSpheres = computed(() => app.spheres.map(x => ({ id: x.id, name: x.name, color: x.color, goal: planOf(x.id), spent: minutesBy.value[x.id] ?? 0 })))
const factSpheres = computed(() => [...ringSpheres.value, { id: OTHER_ID, name: 'Без сферы', color: OTHER_COLOR, goal: 0, spent: otherMinutes.value }].filter(x => x.spent >= 1))
const ring = computed(() => (ringView.value === 'plan' ? planRing(ringSpheres.value) : factRing(factSpheres.value)))
/** Строки под кольцом: на плане все сферы, на факте — те, на которые есть время */
const ringRows = computed(() => (ringView.value === 'plan' ? ringSpheres.value : factSpheres.value))
const factTotal = computed(() => factSpheres.value.reduce((sum, x) => sum + x.spent, 0))
const factPct = (m: number) => { const p = factTotal.value > 0 ? (m / factTotal.value) * 100 : 0; return p > 0 && p < 1 ? '<1' : String(Math.round(p)) }
/** Выполнено по плану: у каждой сферы не больше её цели, ровно закрашенная часть кольца */
const planDone = computed(() => ringSpheres.value.reduce((sum, x) => sum + Math.min(x.spent, x.goal), 0))
const sumGoals = computed(() => app.spheres.reduce((sum, x) => sum + planOf(x.id), 0))
/** Сколько времени не занято целями; меньше нуля — целей больше, чем времени */
const notInGoals = computed(() => Math.max(0, capacity.value) - sumGoals.value)
const freeToday = computed(() => app.freeTodayMinutes)
/** Часы для центра кольца: от часа и больше — без минут */
const hrsShort = (m: number) => (m < 60 ? hrs(m) : Math.round(m / 60) + ' ч')
const R = 70, C = 2 * Math.PI * R
/** Зазор между секторами; единственному сектору он не нужен */
const arcStyle = (a: Arc) => {
  const gap = a.cap < 1 ? 2 : 0
  return { 'stroke-dasharray': `${Math.max(0, Math.min(a.len * C, a.cap * C - gap))} ${C}`, 'stroke-dashoffset': -a.from * C }
}
const hrs = (min: number) => fmtMinutes(Math.round(min))
// ---- Наведение на сектор подсвечивает сферу в списке (и наоборот), клик открывает страницу сферы
const router = useRouter()
const hovered = ref<string | null>(null)
const arcCls = (a: Arc) => ['transition-[opacity,stroke-width] duration-200', a.key !== OTHER_ID && 'cursor-pointer', hovered.value && a.key !== hovered.value && 'opacity-30']
const arcWidth = (a: Arc) => (a.key === hovered.value ? 22 : 18)
const openSphere = (id: string) => { if (id !== OTHER_ID) void router.push('/spheres/' + id) }
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

// ---- Колесо баланса: доли времени сфер за неделю или месяц
const wheelRows = computed(() => app.spheres.map(x => ({ id: x.id, name: x.name, color: x.color, minutes: minutesBy.value[x.id] ?? 0 })))
const wheelTotal = computed(() => wheelRows.value.reduce((sum, x) => sum + x.minutes, 0))
const score = computed(() => balanceScore(wheelRows.value.map(x => x.minutes)))
const sharePct = (m: number) => (wheelTotal.value > 0 ? Math.round((m / wheelTotal.value) * 100) : 0)
/** Последняя активность в сфере: выполненная задача, учтённое время или отметка привычки (из того, что загружено) */
const lastActive = computed(() => {
  const last = new Map<string, string>()
  const bump = (id: string | null | undefined, day: string | null | undefined) => { if (id && day && day > (last.get(id) ?? '')) last.set(id, day) }
  for (const t of app.data.tasks) if (t.status === 'done' && t.done_at) bump(t.sphere_id, t.done_at.slice(0, 10))
  for (const e of app.data.timeEntries) bump(e.sphere_id, e.started_at.slice(0, 10))
  const habitSphere = new Map(app.data.habits.map(h => [h.id, h.sphere_id]))
  for (const e of app.data.habitEntries) if (e.value > 0) bump(habitSphere.get(e.habit_id), e.entry_date)
  return last
})
const daysWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дня' : 'дней')
function lastText(id: string) {
  const d = lastActive.value.get(id)
  if (!d) return 'Давно не было активности'
  const days = Math.round((new Date(app.today + 'T00:00:00Z').getTime() - new Date(d + 'T00:00:00Z').getTime()) / 86400000)
  return days <= 0 ? 'Сегодня' : days === 1 ? 'Вчера' : 'Последний раз ' + days + ' ' + daysWord(days) + ' назад'
}
// ---- Переход на семь сфер жизни: предлагаем, пока какой-то из семи нет или есть сферы вне семи
const MIGRATE_KEY = 'planner-life-migrate-hidden'
const hasAllLife = computed(() => LIFE_SPHERES.every(l => app.spheres.some(x => lifeByName(x.name)?.name === l.name)) && app.spheres.every(x => !!lifeByName(x.name)))
const migrateOpen = ref(false)
const migrateHidden = ref((() => { try { return localStorage.getItem(MIGRATE_KEY) === '1' } catch { return false } })())
function closeMigrate() {
  migrateOpen.value = false
  if (!hasAllLife.value) { migrateHidden.value = true; try { localStorage.setItem(MIGRATE_KEY, '1') } catch { /* не страшно */ } }
}
// ---- Подробности (план, бюджет времени, цели и таймеры) свёрнуты; открытое запоминаем на устройстве
const DETAILS_KEY = 'planner-spheres-details'
const openDetails = ref<string[]>((() => { try { return JSON.parse(localStorage.getItem(DETAILS_KEY) ?? '[]') as string[] } catch { return [] } })())
function onToggle(key: string, e: Event) {
  const open = (e.target as HTMLDetailsElement).open
  openDetails.value = open ? [...new Set([...openDetails.value, key])] : openDetails.value.filter(k => k !== key)
  try { localStorage.setItem(DETAILS_KEY, JSON.stringify(openDetails.value)) } catch { /* не страшно */ }
}

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
    <div class="flex items-center gap-1">
      <button class="btn-ghost" @click="toggleAdding">{{ adding ? 'Закрыть' : '+ Сфера' }}</button>
      <SettingsLink />
    </div>
  </div>

  <SphereMigrate v-if="migrateOpen" @done="closeMigrate" />
  <button v-else-if="!hasAllLife && !migrateHidden && app.spheres.length" type="button" class="card mb-4 flex w-full items-center gap-3 border-accent bg-accent-soft px-4 py-3 text-left" data-test="migrate-offer" @click="migrateOpen = true">
    <span class="min-w-0 flex-1"><span class="block font-semibold text-accent">Перейти на 7 сфер жизни</span><span class="block text-xs text-mute">Здоровье, отношения, карьера, развитие, увлечения, смысл и быт — твои сферы станут ими или проектами внутри них</span></span>
    <span class="text-accent">›</span>
  </button>

  <!-- Колесо баланса: равные секторы, заливка — доля времени сферы; ниже — сферы с процентом и последней активностью -->
  <section class="card mb-4 p-4" data-test="balance">
    <div class="mb-1 flex items-center justify-between gap-2">
      <h2 class="font-semibold">Баланс</h2>
      <div class="inline-flex rounded-xl border border-line bg-white/70 p-0.5 text-xs font-medium">
        <button class="rounded-lg px-3 py-1" :class="period === 'week' ? 'bg-white text-accent-deep shadow-[0_1px_4px_rgba(63,56,114,0.15)]' : 'text-mute'" @click="period = 'week'">Неделя</button>
        <button class="rounded-lg px-3 py-1" :class="period === 'month' ? 'bg-white text-accent-deep shadow-[0_1px_4px_rgba(63,56,114,0.15)]' : 'text-mute'" @click="period = 'month'">Месяц</button>
      </div>
    </div>
    <SphereWheel v-if="app.spheres.length" :rows="wheelRows" :score="score" @open="openSphere" />
    <p class="mb-3 text-center text-xs text-mute">{{ wheelTotal > 0 ? 'Баланс — насколько ровно время распределено между сферами: 10 — поровну во все.' : 'Запусти таймер на задаче, привычке или сфере — колесо начнёт заполняться.' }}</p>
    <ul class="space-y-2" data-test="balance-list">
      <li v-for="x in wheelRows" :key="x.id">
        <RouterLink :to="'/spheres/' + x.id" class="flex items-center gap-3 rounded-2xl bg-white/60 px-3 py-2.5 hover:bg-accent-soft" data-test="balance-row">
          <span class="h-3 w-3 shrink-0 rounded-full" :style="{ background: x.color }"></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-medium">{{ x.name }}</span>
            <span class="block text-xs text-mute">{{ lastText(x.id) }}</span>
          </span>
          <span class="shrink-0 text-sm font-semibold" :class="x.minutes ? 'text-ink' : 'text-mute'">{{ sharePct(x.minutes) }}%</span>
          <span class="text-mute">›</span>
        </RouterLink>
      </li>
    </ul>
    <button v-if="!hasAllLife && migrateHidden && !migrateOpen" type="button" class="mt-3 text-xs font-semibold text-accent" @click="migrateOpen = true">Перейти на 7 сфер жизни</button>
  </section>


  <form v-if="adding" class="card mb-4 space-y-3 p-4" @submit.prevent="save">
    <input v-model="name" class="input" placeholder="Название сферы" maxlength="80" required autofocus />
    <AutoTextarea v-model="description" :min-rows="2" :maxlength="2000" placeholder="Описание сферы (необязательно)" />
    <div class="flex flex-wrap items-center gap-2">
      <button v-for="c in COLORS" :key="c" type="button" class="h-8 w-8 rounded-full ring-offset-2" :class="color === c && 'ring-2 ring-ink'" :style="{ background: c }" :aria-label="'Цвет ' + c" @click="color = c"></button>
      <input v-model="color" type="color" class="h-8 w-8 cursor-pointer rounded-full border border-line bg-white/70 p-0.5" aria-label="Свой цвет" title="Свой цвет" />
    </div>
    <label class="flex items-center gap-3 text-sm text-mute">Цель на неделю, часов
      <input v-model.number="goalHours" type="number" min="0" step="0.5" class="input !w-24" />
    </label>
    <button class="btn-primary w-full">Создать</button>
  </form>

  <!-- Подробности: кольцо плана или факта, плитки бюджета времени -->
  <details class="mb-4" :open="openDetails.includes('plan')" data-test="details-plan" @toggle="onToggle('plan', $event)">
  <summary class="mb-2 cursor-pointer select-none text-sm font-semibold uppercase tracking-wide text-mute">План и бюджет времени</summary>
  <div class="card p-5" data-test="time-budget">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
      <div class="inline-flex rounded-xl border border-line bg-white/70 p-0.5" data-test="ring-view">
        <button class="rounded-lg px-3 py-1" :class="ringView === 'plan' ? 'bg-white text-accent-deep shadow-[0_1px_4px_rgba(63,56,114,0.15)]' : 'text-mute'" data-test="ring-plan" @click="setRingView('plan')">План</button>
        <button class="rounded-lg px-3 py-1" :class="ringView === 'fact' ? 'bg-white text-accent-deep shadow-[0_1px_4px_rgba(63,56,114,0.15)]' : 'text-mute'" data-test="ring-fact" @click="setRingView('fact')">Факт</button>
      </div>
      <div class="inline-flex rounded-xl border border-line bg-white/70 p-0.5">
        <button class="rounded-lg px-3 py-1" :class="period === 'week' ? 'bg-white text-accent-deep shadow-[0_1px_4px_rgba(63,56,114,0.15)]' : 'text-mute'" @click="period = 'week'">Неделя</button>
        <button class="rounded-lg px-3 py-1" :class="period === 'month' ? 'bg-white text-accent-deep shadow-[0_1px_4px_rgba(63,56,114,0.15)]' : 'text-mute'" @click="period = 'month'">Месяц</button>
      </div>
    </div>
    <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
      <div class="relative h-[190px] w-[190px] shrink-0">
        <svg width="190" height="190" viewBox="0 0 190 190" class="-rotate-90" aria-hidden="true">
          <circle v-if="!ring.tint.length && !ring.solid.length" cx="95" cy="95" :r="R" fill="none" stroke="#E8E4F3" stroke-width="18" />
          <circle v-for="a in ring.tint" :key="'t' + a.key" cx="95" cy="95" :r="R" fill="none" :stroke="a.color" stroke-opacity="0.25" :stroke-width="arcWidth(a)" v-bind="arcStyle(a)"
            :class="arcCls(a)" data-test="ring-tint" @mouseenter="hovered = a.key" @mouseleave="hovered = null" @click="openSphere(a.key)" />
          <circle v-for="a in ring.solid" :key="'s' + a.key" cx="95" cy="95" :r="R" fill="none" :stroke="a.color" :stroke-width="arcWidth(a)" v-bind="arcStyle(a)"
            :class="arcCls(a)" data-test="ring-solid" @mouseenter="hovered = a.key" @mouseleave="hovered = null" @click="openSphere(a.key)" />
        </svg>
        <div class="pointer-events-none absolute inset-0 grid place-content-center text-center" data-test="ring-center">
          <template v-if="ringView === 'plan'">
            <template v-if="sumGoals > 0">
              <div class="text-2xl font-bold leading-tight" :title="hrs(planDone)">{{ hrsShort(planDone) }}</div>
              <div class="text-[11px] leading-tight text-mute">из {{ hrsShort(sumGoals) }}<br />по плану</div>
            </template>
            <div v-else class="px-8 text-xs leading-tight text-mute">Цели на {{ period === 'week' ? 'неделю' : 'месяц' }} не заданы</div>
          </template>
          <template v-else-if="factSpheres.length">
            <div class="text-2xl font-bold leading-tight" :title="hrs(factTotal)">{{ hrsShort(factTotal) }}</div>
            <div class="text-[11px] leading-tight text-mute">учтено<template v-if="availableNow > 0"><br />из ~{{ hrsShort(availableNow) }}</template></div>
          </template>
          <div v-else class="px-8 text-xs leading-tight text-mute">Пока ничего не учтено</div>
        </div>
      </div>

      <div class="w-full min-w-0 flex-1">
        <dl class="grid grid-cols-3 gap-2 text-center sm:text-left">
          <div class="tile tile-violet"><dt class="text-[11px] leading-tight text-mute">Время на {{ period === 'week' ? 'неделю' : 'месяц' }}</dt><dd class="mt-0.5 font-semibold" data-test="capacity">{{ hrs(Math.max(0, capacity)) }}</dd></div>
          <div class="tile tile-pink"><dt class="text-[11px] leading-tight text-mute">Занято целями</dt><dd class="mt-0.5 font-semibold" data-test="in-goals">{{ hrs(sumGoals) }}</dd></div>
          <div class="tile tile-mint"><dt class="text-[11px] leading-tight text-mute">Не занято целями</dt><dd class="mt-0.5 font-semibold" :class="notInGoals < 0 && 'text-red-700'" data-test="not-in-goals">{{ notInGoals < 0 ? '−' : '' }}{{ hrs(Math.abs(notInGoals)) }}</dd></div>
          <div class="col-span-3 flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl bg-accent-soft px-3 py-2 text-left" data-test="today-load">
            <dt class="text-[11px] leading-tight text-mute">Сегодня: свободно / запланировано</dt>
            <dd class="font-semibold">{{ hrs(freeToday) }} / <span :class="app.plannedTodayMinutes > freeToday && 'text-red-700'" data-test="today-planned">{{ hrs(app.plannedTodayMinutes) }}</span></dd>
          </div>
        </dl>
        <ul class="mt-3 space-y-1 text-sm">
          <li v-for="x in ringRows" :key="x.id" class="flex items-center gap-2" :class="x.id !== OTHER_ID && 'cursor-pointer'" data-test="ring-row" :data-hovered="hovered === x.id || undefined"
            @mouseenter="hovered = x.id" @mouseleave="hovered = null" @click="openSphere(x.id)">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full transition-transform duration-200" :class="hovered === x.id && 'scale-110'" :style="{ background: x.color }"></span>
            <span class="min-w-0 flex-1 origin-left truncate transition-all duration-200" :class="hovered === x.id ? 'font-semibold' : hovered && 'opacity-60'" :style="hovered === x.id ? { color: x.color } : undefined">{{ x.name }}</span>
            <span v-if="ringView === 'plan'" class="shrink-0 text-xs text-mute"><span class="font-semibold" :class="x.goal > 0 && x.spent >= x.goal + 1 ? 'text-amber-700' : 'text-ink'">{{ hrs(x.spent) }}</span> / {{ x.goal ? hrs(x.goal) : 'без цели' }}</span>
            <span v-else class="shrink-0 text-xs text-mute"><span class="font-semibold text-ink">{{ hrs(x.spent) }}</span> · {{ factPct(x.spent) }}%</span>
          </li>
        </ul>
      </div>
    </div>

    <p v-if="capacity <= 0" class="mt-3 text-xs text-amber-700">Сон, текучка и работа занимают всё время периода — проверь значения ниже.</p>

    <div class="mt-3 border-t border-line pt-3 text-xs text-mute">
      Из {{ hrs(periodDays.length * 1440) }} вычтено: сон {{ perDayH(app.timeBudget.sleep_minutes_per_day) }}/день · текучка {{ perDayH(app.timeBudget.routine_minutes_per_day) }}/день
      (<RouterLink to="/more" class="font-semibold text-accent">изменить</RouterLink>) ·
      работа {{ hrs(workTotal) }}<template v-if="period === 'week'">
        <button v-if="!workEditing" type="button" class="ml-1 font-semibold text-accent" data-test="work-edit" aria-label="Изменить часы работы" @click="editWork"><Icon name="edit" :size="13" /></button></template>
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
  </details>

  <details class="mb-4" :open="openDetails.includes('goals')" data-test="details-goals" @toggle="onToggle('goals', $event)">
  <summary class="mb-2 cursor-pointer select-none text-sm font-semibold uppercase tracking-wide text-mute">Цели и таймеры сфер</summary>
  <!-- Порядок сфер меняется перетаскиванием за ⋮⋮ — он же везде: в итоге недели, планировании, выборе сферы -->
  <ul v-drag-sort="(ids: string[]) => app.reorderSpheres(ids)" class="space-y-3" data-test="sphere-list">
    <li v-for="s in app.spheres" :key="s.id" :data-id="s.id" class="card p-4">
      <div class="flex items-center gap-3">
        <span data-drag-handle class="-ml-1 -mr-1 shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent" role="button" :aria-label="'Перетащить сферу ' + s.name" title="Перетащи, чтобы изменить порядок сфер">⋮⋮</span>
        <span class="h-3 w-3 shrink-0 rounded-full" :style="{ background: s.color }"></span>
        <RouterLink :to="'/spheres/' + s.id" class="min-w-0 flex-1 truncate font-semibold hover:text-accent" :title="'Открыть сферу ' + s.name">{{ s.name }} <span class="text-mute">›</span></RouterLink>
        <button class="text-xs font-semibold text-mute hover:text-accent" @click="app.openEditor({ sphere_id: s.id }, s.name)">Править время</button>
        <button class="rounded-full px-3 py-1 text-xs font-semibold transition"
          :class="app.running?.sphere_id === s.id && !app.running?.task_id && !app.running?.habit_id ? 'bg-accent text-white' : 'bg-accent-soft text-accent'"
          @click="app.running?.sphere_id === s.id && !app.running?.task_id && !app.running?.habit_id ? app.stopTimer() : app.startTimer({ sphere_id: s.id })">
          <Icon :name="app.running?.sphere_id === s.id && !app.running?.task_id && !app.running?.habit_id ? 'stop' : 'play'" :size="11" /> {{ app.running?.sphere_id === s.id && !app.running?.task_id && !app.running?.habit_id ? 'Стоп' : 'Таймер' }}
        </button>
      </div>
      <p v-if="s.description" class="mt-2 whitespace-pre-line break-words text-sm text-mute" data-test="sphere-desc">{{ s.description }}</p>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-line">
        <div class="h-full rounded-full transition-all" :style="{ width: pct(s.id, app.goalFor(s.id)) + '%', background: s.color }"></div>
      </div>
      <div class="mt-1.5 flex justify-between text-xs text-mute">
        <span>неделя {{ fmtMinutes(Math.round(app.weekMinutes[s.id] ?? 0)) }} · месяц {{ fmtMinutes(Math.round(app.monthMinutes[s.id] ?? 0)) }}</span>
        <button class="font-medium text-accent" @click="editGoal(s.id)">
          <template v-if="app.goalFor(s.id)">цель {{ fmtMinutes(app.goalFor(s.id)) }} · {{ pct(s.id, app.goalFor(s.id)) }}%<span v-if="hasWeekOwnGoal(s.id)" title="Цель только для этой недели"> <Icon name="edit" :size="11" /></span></template>
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
  </details>
  <p v-if="!app.spheres.length" class="card p-8 text-center text-mute">Создай первую сферу: здоровье, хобби, семья…</p>
</template>
