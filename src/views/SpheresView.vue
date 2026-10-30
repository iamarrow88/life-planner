<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import AutoTextarea from '../components/AutoTextarea.vue'
import { fmtMinutes, shortDate, weekStart, addDays, monthStart } from '../lib/time'

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
const R = 70, C = 2 * Math.PI * R
const segments = computed(() => {
  let offset = 0
  return app.spheres.filter(s => (minutesBy.value[s.id] ?? 0) > 0).map(s => {
    const len = ((minutesBy.value[s.id] ?? 0) / total.value) * C
    const seg = { id: s.id, color: s.color, dash: `${Math.max(0, len - 2)} ${C}`, offset: -offset }
    offset += len
    return seg
  })
})
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

  <div class="card mb-4 flex flex-col items-center gap-4 p-5 sm:flex-row sm:gap-8">
    <svg width="180" height="180" viewBox="0 0 180 180" class="shrink-0 -rotate-90">
      <circle cx="90" cy="90" :r="R" fill="none" stroke="#E5E1D8" stroke-width="18" />
      <circle v-for="s in segments" :key="s.id" cx="90" cy="90" :r="R" fill="none" :stroke="s.color" stroke-width="18"
        :stroke-dasharray="s.dash" :stroke-dashoffset="s.offset" stroke-linecap="butt" />
    </svg>
    <div class="text-center sm:text-left">
      <div class="text-3xl font-bold">{{ fmtMinutes(Math.round(total)) }}</div>
      <div class="text-sm text-mute">{{ period === 'week' ? 'за эту неделю' : 'за этот месяц' }}</div>
      <div class="mt-2 inline-flex rounded-xl border border-line bg-white p-0.5 text-xs font-medium">
        <button class="rounded-lg px-3 py-1" :class="period === 'week' ? 'bg-accent text-white' : 'text-mute'" @click="period = 'week'">Неделя</button>
        <button class="rounded-lg px-3 py-1" :class="period === 'month' ? 'bg-accent text-white' : 'text-mute'" @click="period = 'month'">Месяц</button>
      </div>
      <div class="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm sm:justify-start">
        <span v-for="s in app.spheres" :key="s.id" class="inline-flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-full" :style="{ background: s.color }"></span>{{ s.name }}
        </span>
      </div>
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
