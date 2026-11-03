<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import type { Book, BookPatch } from '../types'
import { shortDate, ymd } from '../lib/time'
import AutoTextarea from './AutoTextarea.vue'

/** Книга: в строке — главное, по нажатию строка сменяется полями. Правки сохраняются сами, когда уходишь из поля */
const props = defineProps<{ book: Book; sortable?: boolean }>()
const app = useApp()
const open = ref(false)
const title = ref('')
const author = ref('')
const totalPages = ref<number | string | null>(null)
const startedOn = ref('')
const finishedOn = ref('')
const noteText = ref('')
const notePage = ref<number | string | null>(null)

function show() {
  const b = props.book
  title.value = b.title; author.value = b.author ?? ''; totalPages.value = b.total_pages
  startedOn.value = b.started_on ?? ''; finishedOn.value = b.finished_on ?? ''
  noteText.value = ''; notePage.value = b.status === 'reading' && b.current_page ? b.current_page : null
  open.value = true
}
const intOrNull = (v: number | string | null) => (v === '' || v == null || !(Number(v) > 0) ? null : Math.round(Number(v)))
async function save() {
  const b = props.book, patch: BookPatch = {}
  const t = title.value.trim()
  if (t && t !== b.title) patch.title = t
  if (!t) title.value = b.title
  const a = author.value.trim() || null
  if (a !== (b.author ?? null)) patch.author = a
  const pages = intOrNull(totalPages.value)
  if (pages !== (b.total_pages ?? null)) patch.total_pages = pages
  if (b.status !== 'queue' && startedOn.value && startedOn.value !== b.started_on) patch.started_on = startedOn.value
  if (b.status === 'done' && finishedOn.value && finishedOn.value !== b.finished_on) patch.finished_on = finishedOn.value
  if (Object.keys(patch).length) await app.updateBook(b.id, patch)
}
async function hide() { open.value = false; await save() }

// ---- Прогресс
const percent = computed(() => {
  const b = props.book
  return b.total_pages ? Math.min(100, Math.round((b.current_page / b.total_pages) * 100)) : null
})
function setPage(e: Event) {
  const el = e.target as HTMLInputElement
  const max = props.book.total_pages ?? Infinity
  const page = Math.min(max, Math.max(0, Math.round(Number(el.value) || 0)))
  el.value = String(page)
  if (page !== props.book.current_page) void app.updateBook(props.book.id, { current_page: page })
}

// ---- Даты: когда читала и сколько дней
const dayCount = (from: string, to: string) => Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86400000) + 1
const readingFor = computed(() => (props.book.started_on ? Math.max(1, dayCount(props.book.started_on, app.today)) : null))
const readFor = computed(() => (props.book.started_on && props.book.finished_on ? Math.max(1, dayCount(props.book.started_on, props.book.finished_on)) : null))
/** Дата с годом, если он не текущий: прочитанное бывает и прошлых лет */
const dayLabel = (d: string) => shortDate(d) + (d.slice(0, 4) !== app.today.slice(0, 4) ? ' ' + d.slice(0, 4) : '')
const when = (iso: string) => dayLabel(ymd(new Date(iso)))

// ---- Оценка и заметки
function rate(n: number) { void app.updateBook(props.book.id, { rating: props.book.rating === n ? null : n }) }
const notes = computed(() => [...(props.book.notes ?? [])].reverse())
async function addNote() {
  const text = noteText.value.trim(); if (!text) return
  if (await app.addBookNote(props.book, text, intOrNull(notePage.value))) noteText.value = ''
}
function remove() { if (window.confirm(`Удалить книгу «${props.book.title}» вместе с заметками?`)) void app.removeBook(props.book.id) }
</script>

<template>
  <div>
    <div v-if="!open" class="flex items-start gap-2 px-3 py-2.5">
      <span v-if="sortable" data-drag-handle class="-ml-1 mt-0.5 shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить книгу" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
      <button type="button" class="min-w-0 flex-1 text-left" aria-expanded="false" data-test="book-open" @click="show">
        <span class="block break-words text-[15px] font-medium">{{ book.title }}</span>
        <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
          <span v-if="book.author">{{ book.author }}</span>
          <span v-if="book.total_pages && book.status !== 'reading'">{{ book.total_pages }} стр.</span>
          <template v-if="book.status === 'reading' && book.started_on"><span>с {{ dayLabel(book.started_on) }} · {{ readingFor }}-й день</span></template>
          <template v-if="book.status === 'done'">
            <span v-if="book.started_on && book.finished_on">{{ dayLabel(book.started_on) }} – {{ dayLabel(book.finished_on) }} · {{ readFor }} дн.</span>
            <span v-if="book.rating" class="text-amber-600" :aria-label="'Оценка ' + book.rating + ' из 5'">{{ '★'.repeat(book.rating) }}</span>
          </template>
          <span v-if="book.notes?.length" title="Заметки">📝 {{ book.notes.length }}</span>
        </span>
      </button>
      <button v-if="book.status === 'queue'" type="button" class="chip shrink-0 py-1 hover:chip-on" data-test="book-start" @click="app.startBook(book)">Начать</button>
    </div>
    <!-- Читаю сейчас: страница и прогресс всегда под рукой -->
    <div v-if="!open && book.status === 'reading'" class="px-3 pb-3" data-test="book-progress">
      <div v-if="percent !== null" class="mb-2 h-1.5 overflow-hidden rounded-full bg-line"><div class="h-full rounded-full bg-accent transition-all" :style="{ width: percent + '%' }"></div></div>
      <div class="flex flex-wrap items-center gap-2 text-xs text-mute">
        <label class="flex items-center gap-1.5">Страница
          <input type="number" min="0" :max="book.total_pages ?? undefined" inputmode="numeric" class="input !w-20 !px-2 !py-1 !text-sm" :value="book.current_page" aria-label="Текущая страница" data-test="book-page" @change="setPage" />
        </label>
        <span v-if="book.total_pages">из {{ book.total_pages }} · {{ percent }}%</span>
        <button type="button" class="btn-ghost ml-auto !px-3 !py-1 !text-sm" data-test="book-finish" @click="app.finishBook(book)">Дочитала</button>
      </div>
    </div>

    <div v-if="open" class="space-y-2 p-3" data-test="book-edit" @focusout="save">
      <div class="flex items-start gap-1.5">
        <span v-if="sortable" data-drag-handle class="-ml-1 mt-3 shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить книгу" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
        <AutoTextarea v-model="title" class="min-w-0 flex-1" single-line :maxlength="300" required placeholder="Название книги" />
        <button type="button" class="grid h-9 w-8 shrink-0 place-items-center text-xl leading-none text-mute hover:text-accent" aria-label="Свернуть" title="Свернуть" data-test="book-close" @click="hide">×</button>
      </div>
      <div class="grid grid-cols-[1fr_6rem] gap-2">
        <label class="min-w-0 text-xs text-mute">Автор
          <input v-model="author" class="input mt-1 !px-2 !py-2 !text-sm" maxlength="200" data-test="book-author" />
        </label>
        <label class="min-w-0 text-xs text-mute">Страниц
          <input v-model="totalPages" type="number" min="1" inputmode="numeric" class="input mt-1 !px-2 !py-2 !text-sm" data-test="book-pages" />
        </label>
      </div>
      <div v-if="book.status !== 'queue'" class="grid grid-cols-2 gap-2">
        <label class="min-w-0 text-xs text-mute">Начала читать
          <input v-model="startedOn" type="date" class="input mt-1 !px-2 !py-2 !text-sm" data-test="book-started" />
        </label>
        <label v-if="book.status === 'done'" class="min-w-0 text-xs text-mute">Дочитала
          <input v-model="finishedOn" type="date" class="input mt-1 !px-2 !py-2 !text-sm" data-test="book-finished" />
        </label>
      </div>
      <div v-if="book.status === 'done'" class="flex items-center gap-1 text-xs text-mute" data-test="book-rating">
        <span class="mr-1">Оценка</span>
        <button v-for="n in 5" :key="n" type="button" class="text-xl leading-none" :class="(book.rating ?? 0) >= n ? 'text-amber-500' : 'text-line'" :aria-label="'Оценка ' + n" @click="rate(n)">★</button>
      </div>

      <!-- Заметки: новые сверху, с номером страницы и датой -->
      <div class="rounded-xl bg-bg p-2.5" data-test="book-notes">
        <div class="mb-1.5 text-xs font-semibold text-mute">Заметки<span v-if="notes.length"> · {{ notes.length }}</span></div>
        <form class="space-y-1.5" @submit.prevent="addNote">
          <AutoTextarea v-model="noteText" :min-rows="2" :maxlength="4000" placeholder="Мысль, цитата, впечатление" />
          <div class="flex items-center gap-2 text-xs text-mute">
            <label class="flex items-center gap-1.5">Стр.
              <input v-model="notePage" type="number" min="1" inputmode="numeric" class="input !w-20 !px-2 !py-1 !text-sm" aria-label="Страница заметки" />
            </label>
            <button class="btn-ghost ml-auto !px-3 !py-1 !text-sm" :disabled="!noteText.trim()" data-test="book-note-add">Добавить заметку</button>
          </div>
        </form>
        <ul v-if="notes.length" class="mt-2 divide-y divide-line">
          <li v-for="n in notes" :key="n.id" class="flex items-start gap-2 py-1.5 text-sm" data-test="book-note">
            <span class="min-w-0 flex-1 whitespace-pre-line break-words">{{ n.text }}<span class="mt-0.5 block text-[11px] text-mute"><template v-if="n.page">стр. {{ n.page }} · </template>{{ when(n.at) }}</span></span>
            <button type="button" class="shrink-0 px-1 text-mute hover:text-red-600" aria-label="Удалить заметку" @click="app.removeBookNote(book, n.id)">×</button>
          </li>
        </ul>
      </div>

      <div class="flex flex-wrap items-center gap-2 pt-1">
        <button v-if="book.status === 'queue'" type="button" class="btn-primary !px-3 !py-1.5 !text-sm" data-test="book-start-card" @click="open = false; app.startBook(book)">Начать читать</button>
        <template v-if="book.status === 'reading'">
          <button type="button" class="btn-primary !px-3 !py-1.5 !text-sm" data-test="book-finish-card" @click="open = false; app.finishBook(book)">Дочитала</button>
          <button type="button" class="btn-ghost !px-3 !py-1.5 !text-sm" data-test="book-requeue" @click="open = false; app.requeueBook(book)">Вернуть в очередь</button>
        </template>
        <button v-if="book.status === 'done'" type="button" class="btn-ghost !px-3 !py-1.5 !text-sm" title="Например, отметила по ошибке или читаю снова" data-test="book-reread" @click="open = false; app.startBook(book)">Вернуть в «Читаю»</button>
        <button type="button" class="ml-auto text-xs text-mute hover:text-red-600" data-test="book-remove" @click="remove">Удалить</button>
      </div>
    </div>
  </div>
</template>
