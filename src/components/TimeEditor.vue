<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { TimeEntry } from '../types'
import { entrySeconds, fmtSec, monthStart, shortDate, weekStart, ymd, fmtMinutes } from '../lib/time'

const app = useApp()
const entries = ref<TimeEntry[]>([])
const editingId = ref<string | null>(null)
const date = ref(app.today)
const start = ref('09:00')
const minutes = ref(30)
const busy = ref(false)

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
function resetForm() {
  editingId.value = null; minutes.value = 30
  const day = app.editor?.day
  if (day && day !== app.today) { date.value = day; start.value = '09:00'; return }   // другой день — удобное время по умолчанию
  // по умолчанию — «последние 30 минут»
  const n = new Date(Date.now() - 30 * 60000)
  date.value = ymd(n); start.value = `${pad(n.getHours())}:${pad(n.getMinutes())}`
}
async function refresh() {
  if (!app.editor) return
  entries.value = (await app.listEntries(app.editor.target)) ?? []
}
watch(() => app.editor, e => { if (e) { showAllDays.value = false; resetForm(); void refresh() } })

function edit(e: TimeEntry) {
  editingId.value = e.id; date.value = dayOf(e.started_at); start.value = clock(e.started_at)
  minutes.value = Math.max(1, Math.round(entrySeconds(e) / 60))
}
async function save() {
  if (!app.editor || !date.value || !start.value || !(minutes.value > 0)) return
  const from = new Date(`${date.value}T${start.value}`)
  const to = new Date(from.getTime() + Math.round(minutes.value) * 60000)
  if (to.getTime() > Date.now() + 60000) { app.error = 'Время не может быть в будущем'; return }
  busy.value = true
  const ok = editingId.value
    ? await app.updateEntry(editingId.value, from.toISOString(), to.toISOString())
    : await app.addEntry(app.editor.target, from.toISOString(), to.toISOString())
  busy.value = false
  if (ok) { resetForm(); await refresh() }
}
async function remove(id: string) {
  if (await app.removeEntry(id)) { if (editingId.value === id) resetForm(); await refresh() }
}
</script>

<template>
  <div v-if="app.editor" class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" @click.self="app.closeEditor()">
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
        <div class="grid grid-cols-3 gap-2">
          <label class="col-span-3 text-xs text-mute sm:col-span-1">День<input v-model="date" type="date" :max="app.today" class="input mt-1" required /></label>
          <label class="text-xs text-mute">Начало<input v-model="start" type="time" class="input mt-1" required /></label>
          <label class="text-xs text-mute">Минут<input v-model.number="minutes" type="number" min="1" max="1440" class="input mt-1" required /></label>
        </div>
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
    </div>
  </div>
</template>
