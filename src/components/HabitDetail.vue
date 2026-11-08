<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { HabitKind, HabitSchedule as Schedule } from '../types'
import HabitSchedule from './HabitSchedule.vue'
import { ALL_DAYS, defaultSchedule } from '../lib/habitSchedule'
import { dayOf, shortDate } from '../lib/time'
import { useBackdrop } from '../lib/backdrop'

const app = useApp()
const habit = computed(() => app.data.habits.find(h => h.id === app.habitDetailId) ?? null)
const name = ref('')
const kind = ref<HabitKind>('plain')
const target = ref(1)
const sphereId = ref('')
const schedule = ref<Schedule>(defaultSchedule())
// какую дату начала показали пользователю: если он её не менял, а в базе было пусто («день создания»), так и оставляем пустой
let shownStart: string | null = null
const needDays = computed(() => schedule.value.freq === 'week' && schedule.value.mode === 'schedule')
const busy = ref(false)
/** Привычка-таблетка из календаря цикла: расписание и сфера задаются там */
const pill = computed(() => !!habit.value && app.isPillHabit(habit.value.id))
const kinds: { v: HabitKind; label: string }[] = [
  { v: 'timer', label: 'Таймер' }, { v: 'plain', label: 'Без таймера' }, { v: 'counter', label: 'Счётчик' },
]

const formState = () => JSON.stringify([name.value, kind.value, target.value, sphereId.value, schedule.value])
let saved = ''
/** × и подложка: правки сохраняются, карточка закрывается. Сохранить нельзя — спрашиваем, закрыть ли без них */
function closeCard() {
  if (busy.value) return
  if (formState() === saved) { app.closeHabit(); return }
  const problem = !name.value.trim() ? 'у привычки нет названия' : !sphereId.value ? 'не выбрана сфера' : needDays.value && !schedule.value.weekdays.length ? 'не выбраны дни недели' : ''
  if (!problem) { void save(); return }
  if (window.confirm(`Изменения не сохранить: ${problem}. Закрыть без них?`)) app.closeHabit()
}
app.setCardCloser('habit', closeCard)
const bd = useBackdrop(closeCard)
// Форму заполняем, только когда открыли другую привычку: фоновое обновление данных не должно стирать набранное
watch(() => habit.value?.id, () => {
  const h = habit.value
  if (!h) return
  name.value = h.name; kind.value = h.kind; target.value = h.target_value ?? (h.kind === 'timer' ? 20 : 8); sphereId.value = h.sphere_id
  schedule.value = {
    freq: h.freq ?? 'day', interval_n: h.interval_n ?? 1, weekdays: h.weekdays ? [...h.weekdays] : [...ALL_DAYS], mode: h.mode ?? 'schedule',
    starts_on: h.starts_on ?? (h.created_at ? dayOf(h.created_at) : app.today),
  }
  shownStart = schedule.value.starts_on
  saved = formState()
}, { immediate: true })

function pickKind(k: HabitKind) {
  if (k === kind.value) return
  kind.value = k
  target.value = k === 'timer' ? 20 : k === 'counter' ? 8 : 1
}

async function save() {
  const h = habit.value; if (!h || !name.value.trim() || !sphereId.value) return
  if (needDays.value && !schedule.value.weekdays.length) return
  busy.value = true
  const ok = await app.updateHabit(h.id, {
    ...schedule.value, weekdays: [...schedule.value.weekdays].sort(),
    starts_on: !h.starts_on && schedule.value.starts_on === shownStart ? null : schedule.value.starts_on,
    name: name.value.trim(), kind: kind.value, sphere_id: sphereId.value,
    target_value: kind.value === 'plain' ? null : Math.max(1, Math.floor(target.value || 1)),
  })
  busy.value = false
  if (ok) app.closeHabit()
}
/** Сделать задачей: привычка станет повторяющейся задачей с тем же расписанием */
async function toTask() {
  const h = habit.value; if (!h) return
  const unsaved = formState() !== saved ? ' Несохранённые правки в карточке не перенесутся.' : ''
  if (!confirm(`Сделать «${h.name}» повторяющейся задачей с тем же расписанием? Привычка уйдёт из списка привычек, история отметок останется в базе.${unsaved}`)) return
  busy.value = true
  const ok = await app.habitToTask(h.id)
  busy.value = false
  if (ok) app.closeHabit()
}
async function remove() {
  const h = habit.value
  const msg = pill.value
    ? 'Удалить привычку? Пока идёт курс таблеток, календарь цикла вернёт её при следующем открытии. Чтобы таблеток не было, сними отметку первого дня цикла.'
    : 'Удалить привычку? Она пропадёт из списков, а накопленная история останется в базе.'
  if (h && confirm(msg)) { await app.removeHabit(h.id); app.closeHabit() }
}
</script>

<template>
  <div v-if="habit" class="fixed inset-0 z-30 flex items-end justify-center backdrop md:items-center" @pointerdown="bd.down" @click="bd.click">
    <form class="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-bg p-5 md:rounded-3xl" @submit.prevent="save">
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-lg font-bold">Привычка</h2>
        <button type="button" class="text-2xl leading-none text-mute" aria-label="Закрыть" @click="bd.close">×</button>
      </div>
      <p v-if="app.error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-test="card-error">{{ app.error }}</p>

      <input v-model="name" class="input" maxlength="120" required placeholder="Название привычки" aria-label="Название привычки" />

      <div class="flex gap-2">
        <button v-for="k in kinds" :key="k.v" type="button" class="chip flex-1 justify-center py-2" :class="kind === k.v && 'chip-on'" @click="pickKind(k.v)">{{ k.label }}</button>
      </div>
      <label v-if="kind !== 'plain'" class="flex items-center gap-3 text-sm text-mute">
        {{ kind === 'timer' ? 'Минут в день' : 'Раз в день' }}
        <input v-model.number="target" type="number" min="1" class="input !w-24" />
      </label>

      <p v-if="pill" class="rounded-xl bg-accent-soft px-3 py-2 text-sm" data-test="pill-note">
        Дни приёма задаёт курс из календаря цикла<template v-if="habit.active_from && habit.active_until">: {{ shortDate(habit.active_from) }} – {{ shortDate(habit.active_until) }}</template>.
        Время и сферу меняют в <RouterLink to="/today/cycle" class="font-semibold text-accent" @click="app.closeHabit()">его настройках</RouterLink>.
      </p>
      <label v-if="!pill" class="text-xs text-mute">Сфера
        <select v-model="sphereId" class="input mt-1" required><option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option></select>
      </label>

      <HabitSchedule v-if="!pill" v-model="schedule" start-open />
      <button v-if="!pill" type="button" class="btn-ghost" :disabled="busy" data-test="habit-to-task" title="Привычка станет повторяющейся задачей с тем же расписанием" @click="toTask">↻ Сделать задачей</button>

      <button v-if="habit.kind === 'timer'" type="button" class="btn-ghost" data-test="habit-time" @click="app.openEditor({ habit_id: habit.id }, habit.name)">⏱ Затраченное время</button>

      <div class="flex gap-2">
        <button class="btn-primary flex-1" :disabled="busy || !name.trim() || !sphereId || (needDays && !schedule.weekdays.length)">Сохранить</button>
        <button type="button" class="btn-ghost !text-red-700" @click="remove">Удалить</button>
      </div>
    </form>
  </div>
</template>
