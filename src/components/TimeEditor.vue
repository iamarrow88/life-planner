<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { useBackdrop } from '../lib/backdrop'
import type { TimeEntry } from '../types'
import { entrySeconds, fmtSec, monthStart, shortDate, weekStart, ymd, fmtMinutes } from '../lib/time'

const app = useApp()
const entries = ref<TimeEntry[]>([])
const editingId = ref<string | null>(null)
const date = ref(app.today)
const start = ref('09:00')
const end = ref('09:30')
const minutes = ref<number | string>(30)
const busy = ref(false)
/** Что-то вводили в форме: тогда «Выполнено» сначала сохранит запись */
const touched = ref(false)
const bd = useBackdrop(() => app.closeEditor())

const sums = computed(() => {
  const w = weekStart(app.today), m = monthStart(app.today)
  let week = 0, month = 0, all = 0
  for (const e of entries.value) {
    const sec = entrySeconds(e, app.now), d = ymd(new Date(e.started_at))
    all += sec; if (d >= m) month += sec; if (d >= w) week += sec
  }
  return { week, month, all }
})

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const dayOf = (iso: string) => ymd(new Date(iso))

const showAllDays = ref(false)
/** Если редактор открыт «за день» (из календаря), показываем записи этого дня; остальные — по кнопке */
const shownEntries = computed(() => (app.editor?.day && !showAllDays.value ? entries.value.filter(e => dayOf(e.started_at) === app.editor!.day) : entries.value))
// ---- Начало, конец и минуты связаны: минуты и конец считаются от начала, смотря что ввели
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const fromMin = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`
const validMinutes = computed(() => Number(minutes.value) > 0)
/** Конец по началу и минутам */
function syncEnd() { if (start.value && validMinutes.value) end.value = fromMin(toMin(start.value) + Math.round(Number(minutes.value))) }
/** Минуты по началу и концу. Конец раньше начала — значит, закончила уже на следующий день */
function syncMinutes() { if (start.value && end.value) minutes.value = (toMin(end.value) - toMin(start.value) + 1440) % 1440 }
function onStart() { touched.value = true; syncEnd() }
function onEnd() { touched.value = true; syncMinutes() }
function onMinutes() { touched.value = true; syncEnd() }
const nextDay = computed(() => !!start.value && !!end.value && toMin(end.value) < toMin(start.value))

function resetForm() {
  editingId.value = null; minutes.value = 30; touched.value = false
  const day = app.editor?.day
  if (day && day !== app.today) { date.value = day; start.value = '09:00'; syncEnd(); return }   // другой день — удобное время по умолчанию
  // по умолчанию — «последние 30 минут»
  const n = new Date(Date.now() - 30 * 60000)
  date.value = ymd(n); start.value = `${pad(n.getHours())}:${pad(n.getMinutes())}`
  syncEnd()
}
async function refresh() {
  if (!app.editor) return
  entries.value = (await app.listEntries(app.editor.target)) ?? []
}
watch(() => app.editor, e => { if (e) { showAllDays.value = false; resetForm(); void refresh() } })

function edit(e: TimeEntry) {
  editingId.value = e.id; date.value = dayOf(e.started_at); start.value = clock(e.started_at)
  minutes.value = Math.max(1, Math.round(entrySeconds(e) / 60))
  syncEnd()
}
/** Записать то, что в форме. Ошибку показывает над кнопками формы */
async function writeEntry() {
  if (!app.editor) return false
  if (!date.value || !start.value) { app.error = 'Укажи день и время начала'; return false }
  if (!validMinutes.value) { app.error = 'Конец должен быть позже начала'; return false }
  const from = new Date(`${date.value}T${start.value}`)
  const to = new Date(from.getTime() + Math.round(Number(minutes.value)) * 60000)
  if (to.getTime() > Date.now() + 60000) { app.error = 'Конец получается в будущем: проверь начало, конец или минуты'; return false }
  app.error = ''
  return editingId.value
    ? app.updateEntry(editingId.value, from.toISOString(), to.toISOString())
    : app.addEntry(app.editor.target, from.toISOString(), to.toISOString())
}
async function save() {
  busy.value = true
  const ok = await writeEntry()
  busy.value = false
  if (ok) { resetForm(); await refresh() }
}

// ---- «Выполнено»: прямо отсюда отметить задачу и закрыть всё, не возвращаясь в карточку
const task = computed(() => { const id = app.editor?.target.task_id; return id ? app.data.tasks.find(t => t.id === id) ?? null : null })
async function markDone() {
  const t = task.value; if (!t) return
  busy.value = true
  // введённое время не должно пропасть: сначала запись, при ошибке остаёмся в окне
  const saved = !touched.value || await writeEntry()
  if (saved && app.running?.task_id === t.id) await app.stopTimer()
  if (saved) await app.updateTask(t.id, { status: 'done' })
  busy.value = false
  if (!saved || app.error) return
  app.closeEditor()
  // карточка под окном сохранит свои правки и закроется; статус «выполнено» она не тронет
  if (app.detailId === t.id) app.requestCloseTask()
  app.showNotice(`«${t.title.length > 60 ? t.title.slice(0, 60) + '…' : t.title}» выполнена`)
}
async function remove(id: string) {
  if (await app.removeEntry(id)) { if (editingId.value === id) resetForm(); await refresh() }
}
</script>

<template>
  <div v-if="app.editor" class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" @pointerdown="bd.down" @click="bd.click">
    <div class="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-bg p-5 md:rounded-3xl">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-lg font-bold">Затраченное время</h2>
          <p class="truncate text-sm text-mute">{{ app.editor.title }}</p>
        </div>
        <button class="text-2xl leading-none text-mute" aria-label="Закрыть" @click="app.closeEditor()">×</button>
      </div>

      <div class="mb-3 grid grid-cols-3 gap-2 text-center">
        <div v-for="x in [['Неделя', sums.week], ['Месяц', sums.month], ['Всего', sums.all]]" :key="x[0] as string" class="card px-2 py-2">
          <div class="text-[11px] uppercase tracking-wide text-mute">{{ x[0] }}</div>
          <div class="text-sm font-bold">{{ fmtSec(x[1] as number) }}</div>
        </div>
      </div>

      <form class="card mb-3 space-y-2 p-3" @submit.prevent="save">
        <div class="text-xs font-semibold uppercase tracking-wide text-mute">{{ editingId ? 'Правка записи' : 'Добавить время вручную' }}</div>
        <label class="block text-xs text-mute">День<input v-model="date" type="date" :max="app.today" class="input mt-1" required @input="touched = true" /></label>
        <div class="grid grid-cols-3 gap-2">
          <label class="min-w-0 text-xs text-mute">Начало<input v-model="start" type="time" class="input mt-1 h-11 !px-2" required data-test="time-start" @input="onStart" /></label>
          <label class="min-w-0 text-xs text-mute">Конец<input v-model="end" type="time" class="input mt-1 h-11 !px-2" data-test="time-end" @input="onEnd" /></label>
          <label class="min-w-0 text-xs text-mute">Затрачено, мин<input v-model.number="minutes" type="number" min="1" max="1440" inputmode="numeric" class="input mt-1 h-11 !px-2" required data-test="time-minutes" @input="onMinutes" /></label>
        </div>
        <p class="text-xs text-mute">Укажи конец или затраченные минуты: второе посчитается от начала.<template v-if="nextDay"> Конец — на следующий день.</template></p>
        <p v-if="app.error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-test="time-error">{{ app.error }}</p>
        <div class="flex gap-2">
          <button class="btn-primary flex-1" :disabled="busy">{{ editingId ? 'Сохранить' : 'Добавить' }}</button>
          <button v-if="editingId" type="button" class="btn-ghost" @click="resetForm()">Отмена</button>
        </div>
      </form>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <p v-if="app.editor.day && entries.length" class="mb-2 text-xs text-mute">
          <template v-if="!showAllDays">Записи за {{ shortDate(app.editor.day) }}. </template><template v-else>Все записи. </template>
          <button type="button" class="font-semibold text-accent" data-test="editor-all" @click="showAllDays = !showAllDays">{{ showAllDays ? 'Только за этот день' : 'Показать все' }}</button>
        </p>
        <ul v-if="shownEntries.length" class="card divide-y divide-line">
          <li v-for="e in shownEntries" :key="e.id" class="flex items-center gap-3 px-3 py-2.5 text-sm">
            <div class="min-w-0 flex-1">
              <div class="font-medium">{{ shortDate(dayOf(e.started_at)) }}, {{ clock(e.started_at) }}<template v-if="e.ended_at">–{{ clock(e.ended_at) }}</template></div>
              <div class="text-xs text-mute">
                <template v-if="e.ended_at">{{ fmtMinutes(Math.round(entrySeconds(e) / 60)) }}</template><template v-else>идёт сейчас</template>
                · {{ e.source === 'manual' ? 'вручную' : 'таймер' }}
              </div>
            </div>
            <template v-if="e.ended_at">
              <button class="text-xs font-semibold text-accent" @click="edit(e)">Править</button>
              <button class="text-xs text-mute hover:text-red-600" @click="remove(e.id)">Удалить</button>
            </template>
          </li>
        </ul>
        <p v-else class="py-6 text-center text-sm text-mute">{{ app.editor.day && entries.length && !showAllDays ? 'За этот день записей нет' : 'Записей пока нет' }}</p>
      </div>
      <!-- Сразу отметить задачу выполненной: то, что введено в форме, тоже сохранится -->
      <button v-if="task && task.status !== 'done'" type="button" class="btn-ghost mt-3 w-full shrink-0" :disabled="busy" title="Сохранить введённое время, отметить задачу выполненной и закрыть" data-test="time-done" @click="markDone">✓ Выполнено</button>
    </div>
  </div>
</template>
