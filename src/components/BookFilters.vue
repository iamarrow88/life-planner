<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import type { BookStatus } from '../types'
import { BOOK_GENRES, BOOK_STATUSES, EMPTY_BOOK_FILTER, NO_GENRE, bookFilterCount, type BookFilter } from '../lib/books'

/** Панель отбора книг: состояние, жанр, оценка, год издания и даты. Свёрнута, на кнопке — сколько условий задано */
const model = defineModel<BookFilter>({ required: true })
const app = useApp()
const open = ref(false)
const count = computed(() => bookFilterCount(model.value))
const set = <K extends keyof BookFilter>(k: K, v: BookFilter[K]) => { model.value = { ...model.value, [k]: v } }
const toggleStatus = (s: BookStatus) => set('statuses', model.value.statuses.includes(s) ? model.value.statuses.filter(x => x !== s) : [...model.value.statuses, s])
const statuses = computed(() => BOOK_STATUSES.filter(s => s.v !== 'dropped' || app.bookDetailsReady))
/** Жанры: список вариантов и те, что уже встречаются у книг */
const genres = computed(() => [...new Set([...BOOK_GENRES, ...app.books.map(b => b.genre).filter((g): g is string => !!g)])])
const ratings: { v: BookFilter['minRating']; label: string }[] = [{ v: '', label: 'Любая' }, { v: '5', label: '★5' }, { v: '4', label: '★4+' }, { v: '3', label: '★3+' }, { v: 'none', label: 'Без оценки' }]
const ranges = computed(() => [
  { label: 'Добавлена в список', from: 'addedFrom', to: 'addedTo', show: app.bookDetailsReady },
  { label: 'Начала читать', from: 'startedFrom', to: 'startedTo', show: true },
  { label: 'Закончила читать', from: 'finishedFrom', to: 'finishedTo', show: true },
] as const)
const inputValue = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
</script>

<template>
  <div class="mb-4" data-test="book-filters">
    <div class="flex items-center gap-2">
      <button type="button" class="chip py-1.5 text-sm" :class="{ 'chip-on': count > 0 }" :aria-expanded="open" data-test="book-filters-toggle" @click="open = !open">
        Фильтры<template v-if="count"> · {{ count }}</template> {{ open ? '▴' : '▾' }}
      </button>
      <button v-if="count" type="button" class="text-xs font-semibold text-accent" data-test="book-filters-reset" @click="model = { ...EMPTY_BOOK_FILTER, statuses: [] }">Сбросить</button>
    </div>

    <div v-if="open" class="card mt-2 space-y-3 p-3 text-xs text-mute" data-test="book-filters-panel">
      <div>
        <div class="mb-1">Состояние</div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="s in statuses" :key="s.v" type="button" class="chip py-1 text-sm" :class="model.statuses.includes(s.v) && 'chip-on'" :aria-pressed="model.statuses.includes(s.v)" :data-test="'bf-status-' + s.v" @click="toggleStatus(s.v)">{{ s.label }}</button>
        </div>
      </div>
      <div>
        <div class="mb-1">Оценка</div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="r in ratings" :key="r.v" type="button" class="chip py-1 text-sm" :class="model.minRating === r.v && 'chip-on'" :data-test="'bf-rating-' + (r.v || 'any')" @click="set('minRating', r.v)">{{ r.label }}</button>
        </div>
      </div>
      <div v-if="app.bookDetailsReady" class="grid grid-cols-[1fr_auto] gap-2">
        <label class="min-w-0">Жанр
          <select :value="model.genre" class="input mt-1 !px-2 !py-1.5 !text-sm" data-test="bf-genre" @change="set('genre', inputValue($event))">
            <option value="">Любой</option>
            <option v-for="g in genres" :key="g" :value="g">{{ g }}</option>
            <option :value="NO_GENRE">Без жанра</option>
          </select>
        </label>
        <fieldset class="min-w-0">
          <legend>Год издания</legend>
          <div class="mt-1 flex items-center gap-1">
            <input :value="model.yearFrom" type="number" min="1" max="2100" inputmode="numeric" placeholder="с" class="input !w-[4.75rem] !px-2 !py-1.5 !text-sm" aria-label="Год издания с" data-test="bf-year-from" @change="set('yearFrom', inputValue($event))" />
            <span>–</span>
            <input :value="model.yearTo" type="number" min="1" max="2100" inputmode="numeric" placeholder="по" class="input !w-[4.75rem] !px-2 !py-1.5 !text-sm" aria-label="Год издания по" data-test="bf-year-to" @change="set('yearTo', inputValue($event))" />
          </div>
        </fieldset>
      </div>
      <template v-for="r in ranges" :key="r.from">
        <fieldset v-if="r.show" class="min-w-0">
          <legend>{{ r.label }}</legend>
          <div class="mt-1 grid grid-cols-2 gap-2">
            <input :value="model[r.from]" type="date" class="input !px-2 !py-1.5 !text-sm" :aria-label="r.label + ' с'" :data-test="'bf-' + r.from" @change="set(r.from, inputValue($event))" />
            <input :value="model[r.to]" type="date" class="input !px-2 !py-1.5 !text-sm" :aria-label="r.label + ' по'" :data-test="'bf-' + r.to" @change="set(r.to, inputValue($event))" />
          </div>
        </fieldset>
      </template>
    </div>
  </div>
</template>
