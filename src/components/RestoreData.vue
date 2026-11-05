<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { download } from '../lib/export'
import { parseRestoreFile } from '../lib/restoreFile'
import { isNative } from '../lib/native'
import { dayOf, shortDate, todayStr } from '../lib/time'
import type { ExportData, ImportReport } from '../types'

/** Восстановление из JSON-файла экспорта: сначала сводка, потом копия текущих данных и загрузка. База меняется только целиком */
const app = useApp()
const file = ref<ExportData | null>(null)
const fileName = ref('')
/** Лишние символы в начале файла: их пропустили, показываем в сводке */
const skipped = ref('')
const message = ref('')
const busy = ref(false)
const result = ref<ImportReport | null>(null)
const input = ref<HTMLInputElement | null>(null)

const LABELS: [string, string][] = [
  ['tasks', 'задач'], ['spheres', 'сфер'], ['projects', 'проектов'], ['recurrences', 'повторов'], ['habits', 'привычек'],
  ['time_entries', 'записей времени'], ['weekly_reviews', 'итогов недель'], ['wishes', 'желаний'], ['books', 'книг'], ['movies', 'фильмов'], ['monthly_items', 'пунктов чек-листа'],
]
const len = (key: string) => { const v = file.value?.[key]; return Array.isArray(v) ? v.length : 0 }
const summary = computed(() => LABELS.filter(([k]) => len(k) > 0).map(([k, label]) => `${label}: ${len(k)}`))
const hasCycle = computed(() => len('cycle_days') > 0)
const fileDate = computed(() => {
  const d = String(file.value?.exported_at ?? '')
  return d ? shortDate(dayOf(d)) + ' ' + d.slice(0, 4) : ''
})

async function pick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  file.value = null; message.value = ''; result.value = null
  if (!f) return
  fileName.value = f.name
  if (!/\.json$/i.test(f.name)) { message.value = 'Восстановить можно только из файла JSON: в таблицах CSV нет связей между записями.'; return }
  const parsed = parseRestoreFile(await f.text())
  if (parsed.ok) { file.value = parsed.data; skipped.value = parsed.skipped; return }
  message.value = parsed.error === 'broken'
    ? 'Файл повреждён: его не удаётся прочитать. Возможно, его меняли после скачивания. Скачай копию заново и не открывай её в редакторе.'
    : 'Это не файл «Скачать всё · JSON» из KolaApp.'
}
function reset() { file.value = null; fileName.value = ''; skipped.value = ''; if (input.value) input.value.value = '' }

async function restore() {
  if (!file.value) return
  busy.value = true; message.value = ''; result.value = null
  // страховочная копия всего, что есть сейчас, вместе с циклом; без неё не продолжаем
  const current = await app.exportAll(true)
  if (!current) { busy.value = false; message.value = 'Не удалось сделать копию текущих данных, поэтому восстановление не начато. ' + app.error; return }
  if (!await download(`planner-before-restore-${todayStr()}.json`, JSON.stringify(current, null, 2), 'application/json')) {
    busy.value = false; message.value = 'Копия текущих данных не сохранена, поэтому восстановление не начато.'; return
  }
  const report = await app.importAll(file.value)
  busy.value = false
  if (!report) {
    const notReady = /import_all|could not find the function/i.test(app.error)
    message.value = notReady ? 'Выполни planner_import.sql в Supabase (SQL Editor) и попробуй снова.' : 'Восстановление не выполнено, данные не изменились: ' + app.error
    return
  }
  result.value = report
  reset()
}
const restored = computed(() => Object.values(result.value?.counts ?? {}).reduce((s, n) => s + n, 0))
</script>

<template>
  <div data-test="restore">
    <div class="mb-1.5 text-sm font-medium">Восстановить из файла</div>
    <p class="mb-2 text-xs text-mute">Нужен файл «Скачать всё · JSON». Записи из файла добавятся и заменят те же записи, новые останутся.</p>
    <input ref="input" type="file" accept=".json,application/json" class="block w-full text-sm text-mute file:mr-3 file:rounded-xl file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-accent" aria-label="Файл для восстановления" data-test="restore-file" :disabled="busy" @change="pick" />

    <div v-if="file" class="mt-3 space-y-2 rounded-xl bg-bg p-3 text-sm" data-test="restore-preview">
      <p class="font-semibold">Файл от {{ fileDate }}</p>
      <p class="text-xs text-mute">{{ summary.join(', ') || 'записей нет' }}. Календарь цикла: {{ hasCycle ? 'есть' : 'нет' }}.</p>
      <p v-if="skipped" class="text-xs text-amber-900" data-test="restore-skipped">В начале файла были лишние символы «{{ skipped }}»: их пропустили, остальное прочитано.</p>
      <p class="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">Записи, изменённые после этой даты, вернутся к версии из файла, а удалённые появятся снова. То, что появилось позже, останется. Перед началом сохрани копию текущих данных: {{ isNative ? 'откроется меню «Поделиться», выбери, куда её положить' : 'она скачается сама' }}.</p>
      <div class="flex gap-2">
        <button type="button" class="btn-primary flex-1" :disabled="busy" data-test="restore-run" @click="restore">{{ busy ? 'Восстанавливаю…' : 'Восстановить' }}</button>
        <button type="button" class="btn-ghost" :disabled="busy" @click="reset">Отмена</button>
      </div>
    </div>

    <p v-if="message" class="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-test="restore-error">{{ message }}</p>
    <div v-if="result" class="mt-2 space-y-1 rounded-lg bg-accent-soft px-3 py-2 text-sm" data-test="restore-result">
      <p class="font-semibold text-accent">Готово: восстановлено записей {{ restored }}.</p>
      <p v-if="result.merged_spheres" class="text-xs text-mute">Сфер с тем же названием объединено: {{ result.merged_spheres }}.</p>
      <p v-if="result.tasks_without_rule" class="text-xs text-mute">Задач без связи с повтором: {{ result.tasks_without_rule }}: на этот день по повтору уже есть выполненная задача.</p>
      <p v-if="result.skipped_tables.length || result.dropped_columns.length" class="text-xs text-amber-900" data-test="restore-partial">Не всё восстановлено: в базе нет {{ [...result.skipped_tables, ...result.dropped_columns].join(', ') }}. Выполни недостающие SQL-файлы и загрузи этот файл ещё раз.</p>
    </div>
  </div>
</template>
