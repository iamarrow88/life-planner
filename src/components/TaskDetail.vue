<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { fmtSec } from '../lib/time'
import AutoTextarea from './AutoTextarea.vue'
import EstimateInput from './EstimateInput.vue'
import { useBackdrop } from '../lib/backdrop'
import HabitSchedule from './HabitSchedule.vue'
import { ALL_DAYS, defaultSchedule } from '../lib/habitSchedule'
import { matches } from '../lib/recurrence'
import { RULE_KEYS, TEMPLATE_KEYS, type HabitSchedule as Schedule, type NewRecurrence, type Recurrence, type RecurrencePatch } from '../types'

const app = useApp()
const task = computed(() => app.data.tasks.find(t => t.id === app.detailId) ?? null)
const title = ref('')
const note = ref('')
const date = ref('')
const time = ref('')
const estimate = ref<number | null>(null)
/** «Без даты»: задача разобрана (есть сфера), но дата не нужна — она уходит из «Входящих» в список «Без даты» */
const noDate = ref(false)
const sphereId = ref('')
const projectId = ref('')
const newProject = ref('')
/** Новый проект прямо из карточки: создаём в выбранной сфере и сразу выбираем */
async function createProject() {
  const name = newProject.value.trim(); if (!name || !sphereId.value) return
  const p = await app.addProject(sphereId.value, name)
  if (p) { projectId.value = p.id; newProject.value = '' }
}
/** '' — не напоминать, иначе число минут до начала ('0' — в момент начала) */
const remind = ref('')
const remindTouched = ref(false)
const remindOptions = [['', 'Не напоминать'], ['0', 'В момент начала'], ['5', 'За 5 минут'], ['10', 'За 10 минут'], ['15', 'За 15 минут'], ['30', 'За 30 минут'], ['60', 'За 1 час']]
const busy = ref(false)
const presets = [15, 30, 45, 60, 90, 120]
const isRunning = computed(() => !!task.value && app.running?.task_id === task.value.id)
const totals = computed(() => (task.value ? app.taskTotals[task.value.id] : undefined))

// ---- Повтор: правило, по которому создаются следующие задачи (как расписание у привычки)
const rule = computed(() => app.data.recurrences.find(r => r.id === task.value?.recurrence_id) ?? null)
const repeat = ref(false)
const schedule = ref<Schedule>(defaultSchedule())
/** Изменения названия, сферы, времени… у повторяющейся задачи: только эта или и будущие тоже */
const repeatScope = ref<'one' | 'all'>('one')
const isodow = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return ((new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7) + 1 }
const scheduleOf = (r: Recurrence): Schedule => ({
  freq: r.freq, interval_n: r.interval_n, mode: r.mode, starts_on: r.starts_on,
  weekdays: r.weekdays?.length ? [...r.weekdays] : r.freq === 'week' ? [isodow(r.starts_on)] : [...ALL_DAYS],
})

/** Состояние формы: с ним сравниваем, есть ли несохранённые изменения */
const formState = () => JSON.stringify([title.value, note.value, date.value, time.value, estimate.value, noDate.value, sphereId.value, projectId.value,
  remind.value, repeat.value, schedule.value, repeatScope.value, newProject.value])
let saved = ''
const bd = useBackdrop(() => app.closeTask(), () => formState() !== saved)
// Форму заполняем, только когда открыли другую задачу: фоновое обновление данных не должно стирать набранный текст
watch(() => task.value?.id, () => {
  const t = task.value
  if (!t) return
  title.value = t.title; note.value = t.note ?? ''; date.value = t.due_date ?? ''; time.value = t.start_time?.slice(0, 5) ?? ''
  estimate.value = t.estimate_minutes; noDate.value = t.status === 'planned' && !t.due_date; sphereId.value = t.sphere_id ?? ''; projectId.value = t.project_id ?? ''
  remind.value = t.remind_before_minutes == null ? '' : String(t.remind_before_minutes); remindTouched.value = false
  repeat.value = !!rule.value; repeatScope.value = 'one'
  schedule.value = rule.value ? scheduleOf(rule.value) : defaultSchedule(t.due_date ?? app.today)
  newProject.value = ''
  saved = formState()
}, { immediate: true })
function toggleRepeat() {
  repeat.value = !repeat.value
  if (!repeat.value) return
  noDate.value = false // у повторяющейся задачи всегда есть дата
  if (!rule.value) schedule.value = defaultSchedule(date.value || app.today)
}
/** Расписание в виде полей правила */
const ruleFields = computed(() => {
  const s = schedule.value
  return {
    freq: s.freq, interval_n: s.interval_n, mode: s.mode, starts_on: s.starts_on || date.value || app.today,
    weekdays: s.freq === 'week' && s.mode === 'schedule' ? [...s.weekdays].sort() : null,
  }
})
const needDays = computed(() => repeat.value && schedule.value.freq === 'week' && schedule.value.mode === 'schedule' && !schedule.value.weekdays.length)
/** Первая дата по правилу — для задачи без даты, которую делают повторяющейся */
function firstDate(): string {
  const r = { ...ruleFields.value, id: '', title: '', sphere_id: null, start_time: null, estimate_minutes: null, month_day: null, ends_on: null } as Recurrence
  if (r.mode === 'after_completion') return r.starts_on
  for (let i = 0; i <= 7 * 367; i++) { const d = app.addDays(r.starts_on, i); if (matches(r, d)) return d }
  return r.starts_on
}
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** Поля задачи, которые правило копирует в каждую новую задачу */
function templateFrom(due: string | null): Pick<NewRecurrence, (typeof TEMPLATE_KEYS)[number]> {
  const st = due && time.value ? `${time.value}:00` : null
  return {
    title: title.value.trim(), note: note.value.trim() || null, sphere_id: sphereId.value || null,
    project_id: sphereId.value && projectId.value ? projectId.value : null, start_time: st, estimate_minutes: estimate.value,
    remind_before_minutes: st && remind.value !== '' ? Number(remind.value) : null,
  }
}
/** Поменяли ли в этот раз что-то из шаблона (название, описание, сферу, время…) */
const templateChanged = computed(() => {
  const t = task.value; if (!t) return false
  const tpl = templateFrom(date.value || t.due_date)
  return TEMPLATE_KEYS.some(k => !same(tpl[k], t[k]))
})
// Пользователь впервые поставил время начала задаче без времени — предлагаем напомнить за 10 минут
function onTimeInput() {
  if (time.value && !remind.value && !remindTouched.value && !task.value?.start_time) remind.value = '10'
}

/** Убрать дату целиком (вместе со временем и напоминанием): после сохранения задача вернётся во «Входящие» */
function resetDate() { date.value = ''; time.value = ''; remind.value = ''; remindTouched.value = true; noDate.value = false }
/** Включить/выключить «Без даты»: дата, время и напоминание убираются */
function toggleNoDate() {
  noDate.value = !noDate.value
  if (noDate.value) { date.value = ''; time.value = ''; remind.value = ''; remindTouched.value = true }
}
/** Задача без даты уходит из «Входящих», только если выбрана сфера (проект — по желанию) */
const keepsOutOfInbox = computed(() => noDate.value && !date.value && !!sphereId.value)

/** markDone — «Выполнено»: сохраняем правки, останавливаем таймер этой задачи и закрываем её */
async function save(markDone = false) {
  const t = task.value
  if (!t || !title.value.trim()) return
  if (needDays.value) return
  busy.value = true
  // у повторяющейся задачи без даты дата — первый день по правилу
  const due = date.value || (repeat.value ? firstDate() : null)
  const tpl = templateFrom(due) // время без даты не бывает, напоминание — только если есть время
  // запоминаем форму до сохранения: дальше данные перечитываются
  const changedTpl = templateChanged.value, wantRepeat = repeat.value, fields = { ...ruleFields.value }, scope = repeatScope.value
  const r = rule.value
  if (markDone && isRunning.value) await app.stopTimer()
  await app.updateTask(t.id, { ...tpl, due_date: due, status: markDone || t.status === 'done' ? 'done' : due || keepsOutOfInbox.value ? 'planned' : 'inbox' })
  if (!app.error) {
    if (wantRepeat && !r) await app.attachRecurrence(t.id, { ...tpl, ...fields })
    else if (!wantRepeat && r) await app.detachRecurrence(r.id, t.id)
    else if (wantRepeat && r) {
      const patch: RecurrencePatch = {}
      if (RULE_KEYS.some(k => !same(fields[k], r[k]))) Object.assign(patch, fields)
      if (scope === 'all' && changedTpl) Object.assign(patch, tpl)
      if (Object.keys(patch).length) await app.updateRecurrence(r.id, patch, t.id)
    }
  }
  busy.value = false
  if (!app.error) app.closeTask()
}
async function remove() {
  const t = task.value
  if (t && confirm('Удалить задачу?')) { await app.removeTask(t.id); app.closeTask() }
}
</script>

<template>
  <div v-if="task" class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" @pointerdown="bd.down" @click="bd.click">
    <form class="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-bg p-5 md:rounded-3xl" @submit.prevent="save()">
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-lg font-bold">Задача</h2>
        <button type="button" class="text-2xl leading-none text-mute" aria-label="Закрыть" @click="bd.close">×</button>
      </div>

      <AutoTextarea v-model="title" single-line :maxlength="500" required placeholder="Название задачи" @submit="save()" />
      <AutoTextarea v-model="note" :min-rows="3" placeholder="Описание задачи" />

      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs text-mute">
          <span class="flex items-center justify-between">Дата<button v-if="date" type="button" class="font-semibold text-accent" aria-label="Сбросить дату" title="Убрать дату: задача вернётся во «Входящие»" @click="resetDate">сбросить</button></span>
          <input v-model="date" type="date" class="input mt-1" @input="date && (noDate = false)" />
        </label>
        <label class="text-xs text-mute">Время начала<input v-model="time" type="time" class="input mt-1" :disabled="!date" @input="onTimeInput" @change="onTimeInput" /></label>
      </div>

      <div v-if="task.status !== 'done'" class="-mt-1 flex flex-wrap items-center gap-2 text-xs text-mute">
        <button type="button" class="chip py-1" :class="noDate && 'chip-on'" :aria-pressed="noDate" data-test="no-date" @click="toggleNoDate">Без даты</button>
        <span v-if="keepsOutOfInbox">Задача уйдёт из «Входящих» в список «Без даты» на экране «Сегодня».</span>
        <span v-else-if="noDate">Чтобы убрать задачу из «Входящих», выбери сферу ниже.</span>
        <span v-else-if="!date">Без даты задача лежит во «Входящих».</span>
      </div>

      <label class="text-xs text-mute">Напоминание
        <select v-model="remind" class="input mt-1" :disabled="!date || !time" @change="remindTouched = true">
          <option v-for="o in remindOptions" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
        </select>
        <span v-if="!date || !time" class="mt-1 block">Чтобы напомнить, задай дату и время начала.</span>
      </label>

      <div>
        <div class="mb-1.5 text-xs text-mute">Сколько времени займёт (необязательно)</div>
        <div class="flex flex-wrap items-center gap-1.5">
          <EstimateInput v-model="estimate" />
          <button v-for="p in presets" :key="p" type="button" class="chip py-1.5" :class="estimate === p && 'chip-on'" @click="estimate = estimate === p ? null : p">{{ p }}</button>
          <button v-if="estimate" type="button" class="text-xs text-mute" @click="estimate = null">сбросить</button>
        </div>
      </div>

      <label class="text-xs text-mute">Сфера
        <select v-model="sphereId" class="input mt-1" @change="projectId = ''"><option value="">Без сферы</option><option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option></select>
      </label>
      <div v-if="sphereId" class="text-xs text-mute">
        <label>Проект
          <select v-model="projectId" class="input mt-1"><option value="">Без проекта</option><option v-for="p in app.projectsOf(sphereId)" :key="p.id" :value="p.id">{{ p.name }}</option><option v-if="projectId && app.projectById(projectId)?.status === 'archived'" :value="projectId">{{ app.projectById(projectId)?.name }} (в архиве)</option></select>
        </label>
        <form class="mt-1.5 flex gap-1.5" @submit.prevent="createProject">
          <input v-model="newProject" class="input min-w-0 flex-1 !py-1.5 text-sm" maxlength="80" placeholder="＋ Новый проект в этой сфере" aria-label="Новый проект" />
          <button class="btn-ghost shrink-0 !py-1.5" :disabled="!newProject.trim()" aria-label="Добавить проект">Добавить</button>
        </form>
      </div>

      <!-- Повтор -->
      <div class="space-y-2" data-test="task-repeat">
        <div class="flex flex-wrap items-center gap-2 text-xs text-mute">
          <button type="button" class="chip py-1" :class="repeat && 'chip-on'" :aria-pressed="repeat" data-test="repeat-toggle" @click="toggleRepeat">↻ Повторять</button>
          <span v-if="repeat && !rule && !date">Дата задачи — первый день по расписанию.</span>
          <span v-if="!repeat && rule">Повтор отключится: будущие задачи по нему удалятся, эта останется.</span>
        </div>
        <HabitSchedule v-if="repeat" v-model="schedule" kind="task" :start-open="!rule" />
        <div v-if="repeat && rule && templateChanged" class="rounded-2xl border border-line bg-white p-3 text-xs text-mute" data-test="repeat-scope">
          <div class="mb-1.5">Изменения названия, сферы, времени и т. п. применить:</div>
          <div class="flex gap-1.5">
            <button type="button" class="chip flex-1 justify-center py-1.5" :class="repeatScope === 'one' && 'chip-on'" @click="repeatScope = 'one'">Только к этой</button>
            <button type="button" class="chip flex-1 justify-center py-1.5" :class="repeatScope === 'all' && 'chip-on'" @click="repeatScope = 'all'">И к следующим</button>
          </div>
        </div>
      </div>

      <div v-if="task.status !== 'done'" class="flex items-center gap-2">
        <button type="button" class="btn-ghost flex-1" @click="isRunning ? app.stopTimer() : app.startTimer({ task_id: task.id })">
          {{ isRunning ? '■ Остановить таймер' : '▶ Запустить таймер' }}
        </button>
        <button type="button" class="btn-ghost" @click="app.openEditor({ task_id: task.id }, task.title)">⏱ Время</button>
      </div>
      <p v-if="totals && totals.month > 0" class="text-xs text-mute">Потрачено: неделя {{ fmtSec(totals.week) }} · месяц {{ fmtSec(totals.month) }}</p>

      <div class="flex gap-2">
        <button class="btn-primary flex-1" :disabled="busy || needDays">Сохранить</button>
        <button v-if="task.status !== 'done'" type="button" class="btn-ghost" :disabled="busy || needDays" data-test="task-done" :title="isRunning ? 'Остановить таймер и отметить выполненной' : 'Отметить выполненной'" @click="save(true)">✓ Выполнено</button>
        <button type="button" class="btn-ghost !text-red-700" @click="remove">Удалить</button>
      </div>
    </form>
  </div>
</template>
