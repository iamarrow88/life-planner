<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { addDays, longDate, shortDate, hhmm } from '../lib/time'
import { daysBetween } from '../lib/cycle'
import { useBackdrop } from '../lib/backdrop'
import AutoTextarea from '../components/AutoTextarea.vue'
import CycleHistory from '../components/CycleHistory.vue'
import MonthGrid from '../components/MonthGrid.vue'

const app = useApp()
// ---- Месяц
const month = ref(app.today.slice(0, 7)) // 'YYYY-MM'

// ---- Текущий курс
const course = computed(() => app.pillCourseOn(app.today))
const nextCourse = computed(() => app.cycleCourses.find(c => c.starts_on > app.today) ?? null)
const lastCourse = computed(() => app.cycleCourses.filter(c => c.ends_on < app.today).at(-1) ?? null)
const courseDayNo = (d: string) => { const c = app.pillCourseOn(d); return c ? daysBetween(c.starts_on, d) + 1 : null }
const courseLen = (c: { starts_on: string; ends_on: string }) => daysBetween(c.starts_on, c.ends_on) + 1

// ---- Окно дня
const sel = ref<string | null>(null)
const note = ref('')
const busy = ref(false)
const selDay = computed(() => (sel.value ? app.cycleDayOf(sel.value) : null))
const savedNote = computed(() => selDay.value?.note ?? '')
const bd = useBackdrop(() => { sel.value = null }, () => note.value.trim() !== savedNote.value)
watch(sel, d => { note.value = d ? (app.cycleDayOf(d).note ?? '') : '' })
const isFuture = computed(() => !!sel.value && sel.value > app.today)
const latest = computed(() => app.currentCycleStart)
/** Перенести начало текущего цикла можно на любой прошедший день после начала предыдущего цикла */
const canMove = computed(() => {
  const d = sel.value, l = latest.value
  if (!d || !l || d === l || d > app.today) return false
  const prev = app.cycleStartList.at(-2)
  return !prev || d > prev
})
/** День позже начала текущего цикла (или циклов ещё нет) — с него может начаться новый цикл */
const canStartNew = computed(() => !!sel.value && (!latest.value || sel.value > latest.value))
async function act(fn: () => Promise<boolean>) { busy.value = true; await fn(); busy.value = false }
const togglePeriod = () => act(() => app.setPeriod(sel.value!, !selDay.value!.period))
const markStart = () => act(() => app.markCycleStart(sel.value!))
const moveStart = () => act(() => app.moveCycleStart(sel.value!))
function unmarkStart() {
  const d = sel.value!
  const lost = [
    app.cycleCourses.some(c => c.cycle_start === d) && 'курс таблеток этого цикла (отметки приёма останутся)',
    app.cycleDayOf(d).cycle_note && 'примечание к циклу',
  ].filter(Boolean)
  if (lost.length && !confirm(`Снять отметку «первый день цикла»? Удалится ${lost.join(' и ')}.`)) return
  void act(() => app.unmarkCycleStart(d))
}
const saveNote = () => act(() => app.setCycleNote(sel.value!, note.value))

// ---- Настройки
const showSettings = ref(false)
const st = app.cycleSettings
const form = ref({
  link_label: st.link_label, sphere_id: st.sphere_id ?? '', course_from_day: st.course_from_day, course_days: st.course_days,
  morning_time: hhmm(st.morning_time), evening_time: hhmm(st.evening_time),
})
watch(() => app.cycleSettings, s => {
  form.value = { link_label: s.link_label, sphere_id: s.sphere_id ?? '', course_from_day: s.course_from_day, course_days: s.course_days, morning_time: hhmm(s.morning_time), evening_time: hhmm(s.evening_time) }
})
const settingsMsg = ref('')
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(v || a)))
async function saveSettings() {
  settingsMsg.value = ''
  const f = form.value, s = app.cycleSettings
  const from = clamp(f.course_from_day, 1, 60), days = clamp(f.course_days, 1, 120)
  const changed = from !== s.course_from_day || days !== s.course_days
  const ok = await app.saveCycleSettings({
    link_label: f.link_label.trim() || 'День цикла', sphere_id: f.sphere_id || null, course_from_day: from, course_days: days,
    morning_time: f.morning_time || '09:00', evening_time: f.evening_time || '21:00',
  })
  if (!ok) return
  settingsMsg.value = changed && latest.value ? 'Сохранено. Курс текущего цикла пересчитан.' : 'Сохранено.'
}

// Привычки-таблетки удалили, а курс ещё идёт или впереди — возвращаем их
onMounted(() => {
  const s = app.cycleSettings
  const missing = [s.morning_habit_id, s.evening_habit_id].some(id => !id || !app.data.habits.some(h => h.id === id))
  if (app.cycleReady && missing && app.cycleCourses.some(c => c.ends_on >= app.today)) void app.syncPillHabits()
})
const linkPreview = computed(() => `${form.value.link_label.trim() || 'День цикла'} ${app.cycleNo(app.today) ?? 5}`)
</script>

<template>
  <div class="mb-4 flex items-center gap-3">
    <RouterLink to="/today" class="text-2xl leading-none text-mute hover:text-accent" aria-label="Назад к «Сегодня»">‹</RouterLink>
    <h1 class="flex-1 text-2xl font-bold">Календарь цикла</h1>
  </div>

  <p v-if="!app.cycleReady" class="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" data-test="cycle-sql">
    Чтобы пользоваться календарём, выполни <code>planner_cycle.sql</code> в Supabase (SQL Editor).
  </p>
  <template v-else>
    <div class="card mb-4 p-4 text-sm" data-test="course-summary">
      <template v-if="course">
        <div class="font-semibold">💊 Приём таблеток: день {{ courseDayNo(app.today) }} из {{ courseLen(course) }}</div>
        <div class="text-mute">{{ shortDate(course.starts_on) }} – {{ shortDate(course.ends_on) }}</div>
      </template>
      <div v-else-if="nextCourse" class="text-mute">Следующий курс таблеток: {{ shortDate(nextCourse.starts_on) }} – {{ shortDate(nextCourse.ends_on) }}</div>
      <div v-else-if="lastCourse" class="text-mute">Курс таблеток закончился {{ shortDate(lastCourse.ends_on) }}. Новый начнётся, когда отметишь первый день цикла.</div>
      <div v-else class="text-mute">Отметь первый день цикла — курс таблеток посчитается по схеме из настроек.</div>
    </div>

    <MonthGrid v-model="month" :today="app.today" data-test="cycle-calendar">
      <template #day="{ d, inMonth }">
        <button type="button" :data-day="d"
          class="relative flex h-11 flex-col items-center justify-center rounded-xl text-sm transition hover:ring-2 hover:ring-accent/40"
          :class="[
            !inMonth && 'opacity-35',
            app.cycleDayOf(d).period ? 'bg-rose-400 text-white' : 'bg-white',
            app.cycleDayOf(d).cycle_start && 'ring-2 ring-rose-700',
            d === app.today && 'font-bold underline underline-offset-2',
          ]"
          :aria-label="longDate(d)" @click="sel = d">
          {{ Number(d.slice(8)) }}
          <span v-if="app.pillCourseOn(d)" class="absolute right-0.5 top-0 text-[9px] leading-none" data-test="pill-mark">💊</span>
          <span v-if="app.cycleDayOf(d).note" class="absolute bottom-1 h-1.5 w-1.5 rounded-full" :class="app.cycleDayOf(d).period ? 'bg-white' : 'bg-accent'" data-test="note-mark"></span>
        </button>
      </template>
    </MonthGrid>
    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
      <span class="inline-flex items-center gap-1"><span class="h-3 w-3 rounded bg-rose-400"></span>менструация</span>
      <span class="inline-flex items-center gap-1"><span class="h-3 w-3 rounded ring-2 ring-rose-700"></span>первый день цикла</span>
      <span class="inline-flex items-center gap-1">💊 приём таблеток</span>
      <span class="inline-flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-accent"></span>заметка</span>
    </div>

    <CycleHistory />

    <!-- Настройки -->
    <section class="mt-6">
      <button class="text-sm font-semibold text-accent" :aria-expanded="showSettings" data-test="cycle-settings-toggle" @click="showSettings = !showSettings">Настройки {{ showSettings ? '▴' : '▾' }}</button>
      <form v-if="showSettings" class="card mt-2 space-y-3 p-4" data-test="cycle-settings" @submit.prevent="saveSettings">
        <label class="block text-sm">Подпись на экране «Сегодня»
          <input v-model="form.link_label" class="input mt-1" maxlength="40" aria-label="Подпись на экране «Сегодня»" />
          <span class="mt-1 block text-xs text-mute">Номер дня цикла добавится сам: «{{ linkPreview }}».</span>
        </label>
        <div class="text-sm font-medium">Курс таблеток</div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          с <input v-model.number="form.course_from_day" type="number" min="1" max="60" class="input !w-20" aria-label="С какого дня цикла" /> дня цикла,
          <input v-model.number="form.course_days" type="number" min="1" max="120" class="input !w-20" aria-label="Сколько дней" /> дней
        </div>
        <div class="flex flex-wrap gap-3 text-sm">
          <label class="flex items-center gap-2">Утром <input v-model="form.morning_time" type="time" class="input !w-28" aria-label="Время утренней таблетки" /></label>
          <label class="flex items-center gap-2">Вечером <input v-model="form.evening_time" type="time" class="input !w-28" aria-label="Время вечерней таблетки" /></label>
        </div>
        <p class="text-xs text-mute">В это время в дни курса придёт напоминание «Таблетка · утро / вечер» (если таблетка ещё не отмечена). Нужны включённые уведомления во «Ещё».</p>
        <label class="block text-sm">Сфера привычек «Таблетка»
          <select v-model="form.sphere_id" class="input mt-1">
            <option value="">Авто («Здоровье» или первая)</option>
            <option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <p class="text-xs text-mute">Новая схема сразу пересчитывает курс текущего цикла; курсы прошлых циклов не меняются.</p>
        <button class="btn-primary w-full">Сохранить</button>
        <p v-if="settingsMsg" class="text-xs text-accent" data-test="cycle-settings-msg">{{ settingsMsg }}</p>
      </form>
    </section>
  </template>

  <!-- Окно дня -->
  <div v-if="sel && selDay" class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" data-test="cycle-day" @pointerdown="bd.down" @click="bd.click">
    <div class="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-bg p-5 md:rounded-3xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold first-letter:uppercase">{{ longDate(sel) }}</h2>
          <p class="text-sm text-mute">
            <span v-if="app.cycleNo(sel)">День цикла {{ app.cycleNo(sel) }}</span>
            <span v-if="courseDayNo(sel)"> · 💊 день курса {{ courseDayNo(sel) }} из {{ courseLen(app.pillCourseOn(sel)!) }}</span>
          </p>
        </div>
        <button type="button" class="text-2xl leading-none text-mute" aria-label="Закрыть" @click="bd.close">×</button>
      </div>

      <button type="button" class="chip justify-center py-2" :class="selDay.period && 'chip-on'" :disabled="busy || isFuture" data-test="day-period" @click="togglePeriod">
        {{ selDay.period ? '✓ Менструация' : 'Менструация' }}
      </button>

      <div v-if="selDay.cycle_start" class="flex items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm">
        <span class="font-semibold text-rose-800">Первый день цикла</span>
        <button type="button" class="text-xs text-mute hover:text-red-700" :disabled="busy" data-test="day-unstart" @click="unmarkStart">Снять отметку</button>
      </div>
      <template v-else-if="!isFuture">
        <button v-if="canMove" type="button" class="btn-ghost" :disabled="busy" data-test="day-move" @click="moveStart">
          Перенести сюда начало текущего цикла (с {{ shortDate(latest!) }})
        </button>
        <p v-if="canMove" class="text-xs text-mute">Перенос пересчитает даты курса таблеток этого цикла; уже сделанные отметки приёма останутся.</p>
        <button v-if="canStartNew" type="button" class="btn-ghost" :disabled="busy" data-test="day-start" @click="markStart">Новый цикл с этого дня</button>
        <button v-else-if="!canMove" type="button" class="btn-ghost" :disabled="busy" data-test="day-start" @click="markStart">Первый день прошлого цикла</button>
      </template>

      <label class="text-sm">Заметка
        <AutoTextarea v-model="note" :maxlength="2000" class="mt-1" placeholder="Самочувствие, симптомы…" />
      </label>
      <button type="button" class="btn-primary" :disabled="busy || note.trim() === savedNote" data-test="day-note-save" @click="saveNote">Сохранить заметку</button>
    </div>
  </div>
</template>
