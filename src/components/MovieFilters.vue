<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import type { MovieStatus } from '../types'
import { EMPTY_MOVIE_FILTER, MOVIE_GENRES, MOVIE_STATUSES, NO_VALUE, movieFilterCount, type MovieFilter } from '../lib/movies'
import { RATING_CHOICES as ratings } from '../lib/rangeFilter'
import Icon from './Icon.vue'

/** Фильтры фильмов и переключатель «Только избранное». Панель свёрнута, на кнопке — сколько условий задано */
const model = defineModel<MovieFilter>({ required: true })
const favorites = defineModel<boolean>('favorites', { required: true })
const app = useApp()
const open = ref(false)
const count = computed(() => movieFilterCount(model.value))
const set = <K extends keyof MovieFilter>(k: K, v: MovieFilter[K]) => { model.value = { ...model.value, [k]: v } }
const toggleStatus = (s: MovieStatus) => set('statuses', model.value.statuses.includes(s) ? model.value.statuses.filter(x => x !== s) : [...model.value.statuses, s])
/** Жанры: список вариантов и те, что уже встречаются */
const genres = computed(() => [...new Set([...MOVIE_GENRES, ...app.movies.map(m => m.genre).filter((g): g is string => !!g)])])
/** Страны — только те, что есть у фильмов */
const countries = computed(() => [...new Set(app.movies.map(m => m.country?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'ru')))
const ranges = computed(() => [
  { label: 'Добавлен в список', from: 'addedFrom', to: 'addedTo', show: app.movieDetailsReady },
  { label: 'Дата просмотра', from: 'watchedFrom', to: 'watchedTo', show: true },
] as const)
const value = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
</script>

<template>
  <div class="mb-4" data-test="movie-filters">
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="chip py-1.5 text-sm" :class="{ 'chip-on': count > 0 }" :aria-expanded="open" data-test="movie-filters-toggle" @click="open = !open">
        Фильтры<template v-if="count"> · {{ count }}</template> {{ open ? '▴' : '▾' }}
      </button>
      <button v-if="app.movieDetailsReady" type="button" role="switch" class="chip py-1.5 text-sm" :class="{ 'chip-on': favorites }" :aria-checked="favorites" data-test="movie-favorites-only" @click="favorites = !favorites">
        <Icon name="heart" :size="14" filled class="mr-1" :class="favorites ? 'text-white' : 'text-rose-500'" />Только избранное
      </button>
      <button v-if="count || favorites" type="button" class="text-xs font-semibold text-accent" data-test="movie-filters-reset" @click="model = { ...EMPTY_MOVIE_FILTER, statuses: [] }; favorites = false">Сбросить</button>
    </div>

    <div v-if="open" class="card mt-2 space-y-3 p-3 text-xs text-mute" data-test="movie-filters-panel">
      <div>
        <div class="mb-1">Состояние</div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="s in MOVIE_STATUSES" :key="s.v" type="button" class="chip py-1 text-sm" :class="{ 'chip-on': model.statuses.includes(s.v) }" :aria-pressed="model.statuses.includes(s.v)" :data-test="'mf-status-' + s.v" @click="toggleStatus(s.v)">{{ s.label }}</button>
        </div>
      </div>
      <div>
        <div class="mb-1">Оценка</div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="r in ratings" :key="r.v" type="button" class="chip py-1 text-sm" :class="{ 'chip-on': model.minRating === r.v }" :data-test="'mf-rating-' + (r.v || 'any')" @click="set('minRating', r.v)">{{ r.label }}</button>
        </div>
      </div>
      <div v-if="app.movieDetailsReady" class="grid grid-cols-2 gap-2">
        <label class="min-w-0">Жанр
          <select :value="model.genre" class="input mt-1 !px-2 !py-1.5 !text-sm" data-test="mf-genre" @change="set('genre', value($event))">
            <option value="">Любой</option>
            <option v-for="g in genres" :key="g" :value="g">{{ g }}</option>
            <option :value="NO_VALUE">Без жанра</option>
          </select>
        </label>
        <label class="min-w-0">Страна
          <select :value="model.country" class="input mt-1 !px-2 !py-1.5 !text-sm" data-test="mf-country" @change="set('country', value($event))">
            <option value="">Любая</option>
            <option v-for="c in countries" :key="c" :value="c">{{ c }}</option>
            <option :value="NO_VALUE">Не указана</option>
          </select>
        </label>
      </div>
      <fieldset class="min-w-0">
        <legend>Год выхода</legend>
        <div class="mt-1 flex items-center gap-1">
          <input :value="model.yearFrom" type="number" min="1880" max="2100" inputmode="numeric" placeholder="с" class="input !w-[5.5rem] !px-2 !py-1.5 !text-sm" aria-label="Год выхода с" data-test="mf-year-from" @change="set('yearFrom', value($event))" />
          <span>–</span>
          <input :value="model.yearTo" type="number" min="1880" max="2100" inputmode="numeric" placeholder="по" class="input !w-[5.5rem] !px-2 !py-1.5 !text-sm" aria-label="Год выхода по" data-test="mf-year-to" @change="set('yearTo', value($event))" />
        </div>
      </fieldset>
      <template v-for="r in ranges" :key="r.from">
        <fieldset v-if="r.show" class="min-w-0">
          <legend>{{ r.label }}</legend>
          <div class="mt-1 grid grid-cols-2 gap-2">
            <input :value="model[r.from]" type="date" class="input !px-2 !py-1.5 !text-sm" :aria-label="r.label + ' с'" :data-test="'mf-' + r.from" @change="set(r.from, value($event))" />
            <input :value="model[r.to]" type="date" class="input !px-2 !py-1.5 !text-sm" :aria-label="r.label + ' по'" :data-test="'mf-' + r.to" @change="set(r.to, value($event))" />
          </div>
        </fieldset>
      </template>
    </div>
  </div>
</template>
