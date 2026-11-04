<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { fmtSec, shortDate, ymd } from '../lib/time'
import AutoTextarea from './AutoTextarea.vue'
import EstimateInput from './EstimateInput.vue'
import TagInput from './TagInput.vue'
import SubtaskList from './SubtaskList.vue'
import { parseTags, uniqTags } from '../lib/tags'
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
const tags = ref<string[]>([])
/** Бюджет, BYN (пусто — не задан) */
const budget = ref<number | null>(null)
/** «Без даты»: задачу разобрала, но когда ею заняться — пока не знаю; уходит из «Входящих» в «Отложено без даты» (сфера не обязательна) */
const noDate = ref(false)
/** Поле тегов: тег, который ещё набирают, надо забрать перед сохранением */
const tagInput = ref<{ flush: () => void } | null>(null)
const sphereId = ref('')
const projectId = ref('')
const newProject = ref('')
/** Поле «новый проект» открывается пунктом «＋ Новый проект…» в списке проектов */
const addingProject = ref(false)
const NEW_PROJECT = '__new'
function onProjectPick() {
  if (projectId.value !== NEW_PROJECT) return
  projectId.value = ''; addingProject.value = true
}
/** Новый проект прямо из карточки: создаём в выбранной сфере и сразу выбираем */
async function createProject() {
  const name = newProject.value.trim(); if (!name || !sphereId.value) return
  const p = await app.addProject(sphereId.value, name)
  if (p) { projectId.value = p.id; newProject.value = ''; addingProject.value = false }
}
/** '' — не напоминать, иначе число минут до начала ('0' — в момент начала) */
const remind = ref('')
const remindTouched = ref(false)
// коротко: список стоит в одной строке с датой и временем
const remindOptions = [['', 'нет'], ['0', 'в начале'], ['5', 'за 5 мин'], ['10', 'за 10 мин'], ['15', 'за 15 мин'], ['30', 'за 30 мин'], ['60', 'за 1 час']]
const busy = ref(false)
/** Длительность по умолчанию — 15 минут (её отдельной кнопки нет), кнопки начинаются с 30 */
const DEFAULT_ESTIMATE = 15
const presets = [30, 45, 60, 90, 120]
const isRunning = computed(() => !!task.value && app.running?.task_id === task.value.id)
const totals = computed(() => (task.value ? app.taskTotal(task.value.id) : undefined))
/** Переносы кнопкой «↷»: больше трёх — повод задуматься, подсвечиваем красным */
const postpones = computed(() => task.value?.postpones ?? [])
const showPostpones = ref(false)
const POSTPONE_ALERT = 3
const timesWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'раз' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'раза' : 'раз')
const atDay = (iso: string) => shortDate(ymd(new Date(iso)))  // день переноса по местному времени

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
/** Приоритет: 1 высокий, 2 средний, 3 низкий, null — нет; повторное нажатие снимает */
const priority = ref<number | null>(null)
const priorities = [
  { v: 1, label: 'Высокий', cls: 'bg-red-300' },
  { v: 2, label: 'Средний', cls: 'bg-orange-300' },
  { v: 3, label: 'Низкий', cls: 'bg-yellow-300' },
]
const formState = () => JSON.stringify([priority.value, title.value, note.value, tags.value, budget.value, date.value, time.value, estimate.value, noDate.value, sphereId.value, projectId.value,
  remind.value, repeat.value, schedule.value, repeatScope.value, newProject.value])
let saved = ''
/** × и подложка: правки сохраняются, карточка закрывается. Сохранить нельзя — спрашиваем, закрыть ли без них */
function closeCard() {
  if (busy.value) return
  tagInput.value?.flush()
  if (formState() === saved) { app.closeTask(); return }
  const problem = !title.value.trim() ? 'у задачи нет названия' : needDays.value ? 'у повтора не выбраны дни недели' : ''
  if (!problem) { void save(); return }
  if (window.confirm(`Изменения не сохранить: ${problem}. Закрыть без них?`)) app.closeTask()
}
app.setCardCloser('task', closeCard)
const bd = useBackdrop(closeCard)
// Форму заполняем, только когда открыли другую задачу: фоновое обновление данных не должно стирать набранный текст
watch(() => task.value?.id, () => {
  const t = task.value
  if (!t) return
  priority.value = t.priority ?? null
  title.value = t.title; note.value = t.note ?? ''; tags.value = [...(t.tags ?? [])]; date.value = t.due_date ?? ''; time.value = t.start_time?.slice(0, 5) ?? ''
  // у задачи по повтору длительность берётся из правила — 15 по умолчанию не подставляем, чтобы не менять правило
  estimate.value = t.estimate_minutes ?? (t.recurrence_id ? null : DEFAULT_ESTIMATE); budget.value = t.budget == null ? null : Number(t.budget); noDate.value = t.status === 'planned' && !t.due_date; sphereId.value = t.sphere_id ?? ''; projectId.value = t.project_id ?? ''
  remind.value = t.remind_before_minutes == null ? '' : String(t.remind_before_minutes); remindTouched.value = false
  repeat.value = !!rule.value; repeatScope.value = 'one'
  schedule.value = rule.value ? scheduleOf(rule.value) : defaultSchedule(t.due_date ?? app.today)
  newProject.value = ''; addingProject.value = false
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
  // «#теги», дописанные прямо в название, тоже становятся тегами
  const p = app.tagsReady ? parseTags(title.value) : { title: title.value.trim(), tags: [] }
  return {
    ...(app.tagsReady ? { tags: uniqTags([...tags.value, ...p.tags]) } : {}),
    ...(app.budgetReady ? { budget: budget.value == null || (budget.value as unknown) === '' || !(Number(budget.value) > 0) ? null : Math.round(Number(budget.value) * 100) / 100 } : {}),
    title: p.title, note: note.value.trim() || null, sphere_id: sphereId.value || null,
    project_id: sphereId.value && projectId.value ? projectId.value : null, start_time: st, estimate_minutes: estimate.value,
    remind_before_minutes: st && remind.value !== '' ? Number(remind.value) : null,
  }
}
/** Поменяли ли в этот раз что-то из шаблона (название, описание, сферу, время…) */
/** Подзадачи для шаблона повтора: те же пункты, все невыполненные */
const freshSubtasks = () => (task.value?.subtasks ?? []).map(s => ({ ...s, done: false }))
const subtasksDiffer = computed(() => !same((task.value?.subtasks ?? []).map(s => s.title), (rule.value?.subtasks ?? []).map(s => s.title)))
const templateChanged = computed(() => {
  const t = task.value; if (!t) return false
  const tpl = templateFrom(date.value || t.due_date)
  // подзадачи сохраняются сразу, а в шаблон повтора попадают, если их состав отличается от правила
  return TEMPLATE_KEYS.some(k => k !== 'subtasks' && !same(tpl[k], t[k])) || (!!rule.value && subtasksDiffer.value)
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
/** Явно нажато «Без даты» — задача уходит из «Входящих» в «Отложено без даты» */
const keepsOutOfInbox = computed(() => noDate.value && !date.value)

/** markDone — «Выполнено»: сохраняем правки, останавливаем таймер этой задачи и закрываем её */
async function save(markDone = false) {
  tagInput.value?.flush()
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
  await app.updateTask(t.id, { ...tpl, ...(app.priorityReady ? { priority: priority.value } : {}), due_date: due, status: markDone || t.status === 'done' ? 'done' : due || keepsOutOfInbox.value ? 'planned' : 'inbox' })
  if (!app.error) {
    if (wantRepeat && !r) await app.attachRecurrence(t.id, { ...tpl, ...fields, ...(app.subtasksReady ? { subtasks: freshSubtasks() } : {}) })
    else if (!wantRepeat && r) await app.detachRecurrence(r.id, t.id)
    else if (wantRepeat && r) {
      const patch: RecurrencePatch = {}
      if (RULE_KEYS.some(k => !same(fields[k], r[k]))) Object.assign(patch, fields)
      if (scope === 'all' && changedTpl) Object.assign(patch, tpl, app.subtasksReady ? { subtasks: freshSubtasks() } : {})
      if (Object.keys(patch).length) await app.updateRecurrence(r.id, patch, t.id)
    }
  }
  busy.value = false
  if (!app.error) app.closeTask()
}
/** Сделать привычкой: только у повторяющейся задачи со сферой */
async function toHabit() {
  const t = task.value; if (!t || !rule.value || !t.sphere_id) return
  const unsaved = formState() !== saved ? ' Несохранённые правки в карточке не перенесутся.' : ''
  if (!confirm(`Сделать «${t.title}» привычкой с тем же расписанием? Повтор и будущие задачи по нему удалятся${t.status === 'done' ? '' : ', эта задача тоже (если по ней не записано время)'}.${unsaved}`)) return
  busy.value = true
  const ok = await app.taskToHabit(t.id)
  busy.value = false
  if (ok) app.closeTask()
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
        <div v-if="app.priorityReady" class="ml-auto flex items-center gap-1.5 self-center" role="group" aria-label="Приоритет" data-test="task-priority">
          <span class="text-xs text-mute">приоритет</span>
          <button v-for="p in priorities" :key="p.v" type="button" class="h-6 w-6 rounded-full ring-offset-2 ring-offset-bg" :class="[p.cls, priority === p.v && 'ring-2 ring-ink']"
            :aria-label="'Приоритет: ' + p.label.toLowerCase()" :aria-pressed="priority === p.v" :title="p.label" @click="priority = priority === p.v ? null : p.v"></button>
        </div>
        <button type="button" class="text-2xl leading-none text-mute" aria-label="Закрыть" @click="bd.close">×</button>
      </div>
      <p v-if="app.error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-test="card-error">{{ app.error }}</p>

      <AutoTextarea v-model="title" single-line :maxlength="500" required placeholder="Название задачи" @submit="save()" />
      <!-- Описание растёт, пока карточка помещается на экран; дальше сжимается, и текст прокручивается внутри поля -->
      <AutoTextarea v-model="note" class="!shrink !overflow-y-auto min-h-[4.5rem] max-h-[40vh]" :min-rows="2" placeholder="Описание задачи" data-test="task-note" />
      <TagInput v-if="app.tagsReady" ref="tagInput" v-model="tags" />
      <SubtaskList v-if="app.subtasksReady" :task="task" />

      <!-- Когда: дата, время начала и напоминание — одной строкой -->
      <div>
        <div class="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
          <label class="min-w-0 text-xs text-mute">Дата
            <input v-model="date" type="date" class="input mt-1 !px-2" @input="date && (noDate = false)" />
          </label>
          <label class="min-w-0 text-xs text-mute">Время
            <input v-model="time" type="time" class="input mt-1 !px-2" :disabled="!date" @input="onTimeInput" @change="onTimeInput" />
          </label>
          <label class="min-w-0 text-xs text-mute">Напомнить
            <select v-model="remind" class="input mt-1 !px-2" :disabled="!date || !time" :title="!date || !time ? 'Чтобы напомнить, задай дату и время начала' : undefined" @change="remindTouched = true">
              <option v-for="o in remindOptions" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
            </select>
          </label>
        </div>
        <div v-if="task.status !== 'done' || date" class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-mute">
          <button v-if="task.status !== 'done'" type="button" class="chip py-1" :class="noDate && 'chip-on'" :aria-pressed="noDate" data-test="no-date" @click="toggleNoDate">Без даты</button>
          <button v-if="date" type="button" class="font-semibold text-accent" aria-label="Сбросить дату" title="Убрать дату: задача вернётся во «Входящие»" @click="resetDate">сбросить дату</button>
          <span v-if="keepsOutOfInbox">Уйдёт в «Отложено без даты».</span>
          <span v-else-if="!date && task.status !== 'done'">Без даты задача лежит во «Входящих».</span>
        </div>
        <!-- История переносов (кнопка ↷ в строке задачи) -->
        <div v-if="postpones.length" class="mt-1.5 text-xs" data-test="postpones">
          <button type="button" class="font-semibold" :class="postpones.length > POSTPONE_ALERT ? 'text-red-600' : 'text-mute hover:text-accent'" :aria-expanded="showPostpones" @click="showPostpones = !showPostpones">
            ↷ Переносили {{ postpones.length }} {{ timesWord(postpones.length) }} {{ showPostpones ? '▴' : '▾' }}
          </button>
          <ul v-if="showPostpones" class="mt-1 space-y-0.5 text-mute">
            <li v-for="(x, i) in postpones" :key="i">{{ x.from ? shortDate(x.from) : 'без даты' }} → {{ shortDate(x.to) }} <span class="opacity-70">· перенесено {{ atDay(x.at) }}</span></li>
          </ul>
        </div>
      </div>

      <!-- Сколько займёт: по умолчанию 15 минут, кнопки — для остальных частых значений -->
      <div>
        <div class="mb-1 text-xs text-mute">Займёт, минут</div>
        <div class="flex flex-wrap items-center gap-1.5">
          <EstimateInput v-model="estimate" width="!w-20 !px-2" />
          <button v-for="p in presets" :key="p" type="button" class="chip px-2.5 py-1.5" :class="estimate === p && 'chip-on'" @click="estimate = estimate === p ? DEFAULT_ESTIMATE : p">{{ p }}</button>
          <button v-if="estimate" type="button" class="px-1 text-base leading-none text-mute hover:text-accent" aria-label="Без оценки времени" title="Без оценки времени" @click="estimate = null">×</button>
        </div>
      </div>

      <!-- Сфера и проект — одной строкой; новый проект — последним пунктом списка -->
      <div>
        <div class="grid grid-cols-2 gap-2">
          <label class="min-w-0 text-xs text-mute">Сфера
            <select v-model="sphereId" class="input mt-1 !px-2" @change="projectId = ''; addingProject = false"><option value="">Без сферы</option><option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option></select>
          </label>
          <label class="min-w-0 text-xs text-mute">Проект
            <select v-model="projectId" class="input mt-1 !px-2" :disabled="!sphereId" :title="!sphereId ? 'Сначала выбери сферу' : undefined" @change="onProjectPick">
              <option value="">Без проекта</option>
              <option v-for="p in app.projectsOf(sphereId)" :key="p.id" :value="p.id">{{ p.name }}</option>
              <option v-if="projectId && app.projectById(projectId)?.status === 'archived'" :value="projectId">{{ app.projectById(projectId)?.name }} (в архиве)</option>
              <option :value="NEW_PROJECT">＋ Новый проект…</option>
            </select>
          </label>
        </div>
        <form v-if="addingProject && sphereId" class="mt-1.5 flex gap-1.5" @submit.prevent="createProject">
          <input v-model="newProject" class="input min-w-0 flex-1 !py-1.5 text-sm" maxlength="80" placeholder="Название нового проекта" aria-label="Новый проект" autofocus />
          <button class="btn-ghost shrink-0 !py-1.5" :disabled="!newProject.trim()" aria-label="Добавить проект">Добавить</button>
          <button type="button" class="shrink-0 px-1 text-mute" aria-label="Не добавлять проект" @click="addingProject = false; newProject = ''">×</button>
        </form>
      </div>

      <!-- Бюджет и повтор -->
      <div class="space-y-2" data-test="task-repeat">
        <div class="flex flex-wrap items-center gap-2 text-xs text-mute">
          <label v-if="app.budgetReady" class="flex items-center gap-1.5" data-test="task-budget">Бюджет
            <input v-model.number="budget" type="number" min="0" step="0.01" inputmode="decimal" class="input !w-28 !px-2 !py-1.5 text-sm" placeholder="BYN" aria-label="Бюджет задачи, BYN" />
          </label>
          <button type="button" class="chip py-1" :class="repeat && 'chip-on'" :aria-pressed="repeat" data-test="repeat-toggle" @click="toggleRepeat">↻ Повторять</button>
          <span v-if="repeat && !rule && !date">Дата задачи — первый день по расписанию.</span>
          <span v-if="!repeat && rule">Повтор отключится: будущие задачи по нему удалятся, эта останется.</span>
        </div>
        <HabitSchedule v-if="repeat" v-model="schedule" kind="task" :start-open="!rule" />
        <div v-if="rule && repeat" class="flex flex-wrap items-center gap-2 text-xs text-mute">
          <button type="button" class="chip py-1 hover:chip-on" :disabled="busy || !task.sphere_id" data-test="task-to-habit" @click="toHabit">Сделать привычкой</button>
          <span v-if="!task.sphere_id">Сначала выбери сферу и сохрани — привычка всегда живёт в сфере.</span>
        </div>
        <div v-if="repeat && rule && templateChanged" class="rounded-2xl border border-line bg-white p-3 text-xs text-mute" data-test="repeat-scope">
          <div class="mb-1.5">Изменения названия, сферы, времени и т. п. применить:</div>
          <div class="flex gap-1.5">
            <button type="button" class="chip flex-1 justify-center py-1.5" :class="repeatScope === 'one' && 'chip-on'" @click="repeatScope = 'one'">Только к этой</button>
            <button type="button" class="chip flex-1 justify-center py-1.5" :class="repeatScope === 'all' && 'chip-on'" @click="repeatScope = 'all'">И к следующим</button>
          </div>
        </div>
      </div>

      <!-- Таймер и потраченное время — одной строкой -->
      <div class="flex flex-wrap items-center gap-2 text-xs text-mute">
        <button v-if="task.status !== 'done'" type="button" class="chip py-1" :class="isRunning && 'chip-on'" @click="isRunning ? app.stopTimer() : app.startTimer({ task_id: task.id })">
          {{ isRunning ? '■ Стоп' : '▶ Таймер' }}
        </button>
        <button type="button" class="chip py-1" @click="app.openEditor({ task_id: task.id }, task.title)">⏱ Время</button>
        <span v-if="totals && totals.month > 0">потрачено: неделя {{ fmtSec(totals.week) }} · месяц {{ fmtSec(totals.month) }}</span>
      </div>

      <!-- Кнопки всегда на виду, даже если карточка выше экрана (много подзадач, раскрытый повтор) -->
      <div class="sticky -bottom-5 z-10 -mx-5 -mb-5 flex gap-2 bg-bg px-5 pb-5 pt-2" data-test="task-actions">
        <button class="btn-primary flex-1" :disabled="busy || needDays">Сохранить</button>
        <button v-if="task.status !== 'done'" type="button" class="btn-ghost whitespace-nowrap !px-3" :disabled="busy || needDays" data-test="task-done" :title="isRunning ? 'Остановить таймер и отметить выполненной' : 'Отметить выполненной'" @click="save(true)">✓ Выполнено</button>
        <button type="button" class="btn-ghost !px-3 !text-red-700" @click="remove">Удалить</button>
      </div>
    </form>
  </div>
</template>
