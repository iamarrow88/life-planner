<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { Book } from '../types'
import { vDragSort } from '../lib/dragSort'
import BookCard from '../components/BookCard.vue'

/** Библиотека: что читаю сейчас, очередь и прочитанное со сводкой за период */
const app = useApp()
const text = ref('')
const search = ref('')
const q = computed(() => search.value.trim().toLowerCase())
const fits = (b: Book) => !q.value || b.title.toLowerCase().includes(q.value) || (b.author ?? '').toLowerCase().includes(q.value)
  || (b.notes ?? []).some(n => n.text.toLowerCase().includes(q.value))
const reading = computed(() => app.readingBooks.filter(fits))
const queue = computed(() => app.queueBooks.filter(fits))

async function add() {
  const title = text.value.trim(); if (!title) return
  if (await app.addBook(title)) text.value = ''
}

// ---- Прочитано: период запоминается на устройстве
type Period = 'month' | 'year' | 'all' | 'custom'
const PERIOD_KEY = 'kola-library-period'
const period = ref<Period>((() => { try { const v = localStorage.getItem(PERIOD_KEY); return v === 'month' || v === 'all' || v === 'custom' ? v : 'year' } catch { return 'year' } })())
watch(period, v => { try { localStorage.setItem(PERIOD_KEY, v) } catch { /* не запомним — не страшно */ } })
const periods: { v: Period; label: string }[] = [{ v: 'month', label: 'Этот месяц' }, { v: 'year', label: 'Этот год' }, { v: 'all', label: 'Всё время' }, { v: 'custom', label: 'Свой период' }]
const customFrom = ref(app.today.slice(0, 4) + '-01-01')
const customTo = ref(app.today)
const inPeriod = (b: Book) => {
  if (period.value === 'all') return true
  const d = b.finished_on; if (!d) return false
  if (period.value === 'month') return d.slice(0, 7) === app.today.slice(0, 7)
  if (period.value === 'year') return d.slice(0, 4) === app.today.slice(0, 4)
  return (!customFrom.value || d >= customFrom.value) && (!customTo.value || d <= customTo.value)
}
const done = computed(() => app.doneBooks.filter(inPeriod).filter(fits))
const donePages = computed(() => done.value.reduce((sum, b) => sum + (b.total_pages ?? 0), 0))
const booksWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'книга' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'книги' : 'книг')
</script>

<template>
  <RouterLink to="/misc" class="mb-3 inline-block text-sm font-semibold text-accent">‹ Разное</RouterLink>
  <h1 class="mb-3 text-2xl font-bold">Библиотека</h1>

  <p v-if="!app.booksReady" class="card mb-4 bg-amber-50 p-4 text-sm text-amber-900" data-test="books-not-ready">Чтобы сохранять книги, выполни <code>planner_books.sql</code> в Supabase (SQL Editor) и обнови страницу.</p>
  <template v-else>
    <div class="mb-4 grid grid-cols-3 gap-2 text-center" data-test="library-counts">
      <div class="card p-2.5"><div class="text-lg font-bold leading-tight">{{ app.readingBooks.length }}</div><div class="text-[11px] text-mute">читаю</div></div>
      <div class="card p-2.5"><div class="text-lg font-bold leading-tight">{{ app.queueBooks.length }}</div><div class="text-[11px] text-mute">в очереди</div></div>
      <div class="card p-2.5"><div class="text-lg font-bold leading-tight">{{ app.doneBooks.length }}</div><div class="text-[11px] text-mute">прочитано</div></div>
    </div>

    <form class="mb-3 flex gap-2" @submit.prevent="add">
      <input v-model="text" class="input min-w-0 flex-1" maxlength="300" placeholder="Какую книгу хочется прочитать?" aria-label="Новая книга" data-test="book-input" />
      <button class="btn-primary shrink-0" :disabled="!text.trim()">В очередь</button>
    </form>
    <input v-if="app.books.length" v-model="search" type="search" class="input mb-4 !py-2 !text-sm" placeholder="Поиск по названию, автору и заметкам" aria-label="Поиск по книгам" data-test="book-search" />

    <div v-if="!app.books.length" class="card p-8 text-center text-mute" data-test="books-empty">Добавь первую книгу — она встанет в очередь 📚</div>

    <section v-if="reading.length" class="mb-5" data-test="books-reading">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Читаю сейчас</h2>
      <div class="card divide-y divide-line"><BookCard v-for="b in reading" :key="b.id" :book="b" /></div>
    </section>

    <section v-if="queue.length" class="mb-5" data-test="books-queue">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Очередь · {{ queue.length }}</h2>
      <!-- при поиске порядок не меняем: видна только часть очереди -->
      <div v-drag-sort="(ids: string[]) => app.reorderBooks(ids)" class="card divide-y divide-line" data-test="book-queue-list">
        <BookCard v-for="b in queue" :key="b.id" :data-id="b.id" :book="b" :sortable="!q" />
      </div>
    </section>

    <section v-if="app.doneBooks.length" class="mb-5" data-test="books-done">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Прочитано</h2>
      <div class="mb-2 flex flex-wrap gap-1.5">
        <button v-for="p in periods" :key="p.v" type="button" class="chip py-1 text-sm" :class="period === p.v && 'chip-on'" :data-test="'period-' + p.v" @click="period = p.v">{{ p.label }}</button>
      </div>
      <div v-if="period === 'custom'" class="mb-2 grid grid-cols-2 gap-2">
        <label class="min-w-0 text-xs text-mute">С
          <input v-model="customFrom" type="date" class="input mt-1 !px-2 !py-1.5 !text-sm" data-test="period-from" />
        </label>
        <label class="min-w-0 text-xs text-mute">По
          <input v-model="customTo" type="date" class="input mt-1 !px-2 !py-1.5 !text-sm" data-test="period-to" />
        </label>
      </div>
      <p class="mb-2 text-sm" data-test="books-summary"><b>{{ done.length }}</b> {{ booksWord(done.length) }}<template v-if="donePages"> · <b>{{ donePages.toLocaleString('ru-RU') }}</b> стр.</template></p>
      <div v-if="done.length" class="card divide-y divide-line"><BookCard v-for="b in done" :key="b.id" :book="b" /></div>
      <p v-else class="card p-4 text-center text-sm text-mute">За этот период прочитанных книг нет</p>
    </section>

    <p v-if="q && !reading.length && !queue.length && !done.length" class="card p-6 text-center text-mute">Ничего не нашлось</p>
  </template>
</template>
