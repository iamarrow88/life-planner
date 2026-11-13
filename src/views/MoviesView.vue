<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { Movie } from '../types'
import { vDragSort } from '../lib/dragSort'
import MovieCard from '../components/MovieCard.vue'
import MovieFilters from '../components/MovieFilters.vue'
import { EMPTY_MOVIE_FILTER, matchesMovieFilter, movieFilterCount, type MovieFilter } from '../lib/movies'

/** Фильмы: что хочется посмотреть и посмотренное со сводкой за период */
const app = useApp()
const text = ref('')
const search = ref('')
const q = computed(() => search.value.trim().toLowerCase())
// ---- Фильтры и «Только избранное»: запоминаются на этом устройстве
const FILTER_KEY = 'kola-movies-filter', FAV_KEY = 'kola-movies-favorites'
const filter = ref<MovieFilter>((() => {
  try { return { ...EMPTY_MOVIE_FILTER, ...(JSON.parse(localStorage.getItem(FILTER_KEY) ?? 'null') ?? {}) } } catch { return { ...EMPTY_MOVIE_FILTER } }
})())
const favoritesOnly = ref((() => { try { return localStorage.getItem(FAV_KEY) === '1' } catch { return false } })())
watch(filter, v => { try { localStorage.setItem(FILTER_KEY, JSON.stringify(v)) } catch { /* не запомним — не страшно */ } }, { deep: true })
watch(favoritesOnly, v => { try { localStorage.setItem(FAV_KEY, v ? '1' : '0') } catch { /* не запомним — не страшно */ } })
/** Избранное работает, только если в базе есть его колонка */
const favOn = computed(() => favoritesOnly.value && app.movieDetailsReady)
const filtered = computed(() => movieFilterCount(filter.value) > 0 || favOn.value)
/** Поиск или фильтры: видна только часть фильмов */
const narrowed = computed(() => !!q.value || filtered.value)
const fits = (m: Movie) => (!favOn.value || !!m.favorite) && matchesMovieFilter(filter.value, m)
  && (!q.value || m.title.toLowerCase().includes(q.value) || (m.director ?? '').toLowerCase().includes(q.value)
  || (m.country ?? '').toLowerCase().includes(q.value) || (m.notes ?? []).some(n => n.text.toLowerCase().includes(q.value)))
const queue = computed(() => app.queueMovies.filter(fits))

async function add() {
  const title = text.value.trim(); if (!title) return
  if (await app.addMovie(title)) text.value = ''
}

// ---- Посмотрено: период запоминается на устройстве
type Period = 'month' | 'year' | 'all' | 'custom'
const PERIOD_KEY = 'kola-movies-period'
const period = ref<Period>((() => { try { const v = localStorage.getItem(PERIOD_KEY); return v === 'month' || v === 'all' || v === 'custom' ? v : 'year' } catch { return 'year' } })())
watch(period, v => { try { localStorage.setItem(PERIOD_KEY, v) } catch { /* не запомним — не страшно */ } })
const periods: { v: Period; label: string }[] = [{ v: 'month', label: 'Этот месяц' }, { v: 'year', label: 'Этот год' }, { v: 'all', label: 'Всё время' }, { v: 'custom', label: 'Свой период' }]
const customFrom = ref(app.today.slice(0, 4) + '-01-01')
const customTo = ref(app.today)
const inPeriod = (m: Movie) => {
  if (period.value === 'all') return true
  const d = m.watched_on; if (!d) return false
  if (period.value === 'month') return d.slice(0, 7) === app.today.slice(0, 7)
  if (period.value === 'year') return d.slice(0, 4) === app.today.slice(0, 4)
  return (!customFrom.value || d >= customFrom.value) && (!customTo.value || d <= customTo.value)
}
const watched = computed(() => app.watchedMovies.filter(inPeriod).filter(fits))
const moviesWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'фильм' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'фильма' : 'фильмов')
</script>

<template>
  <RouterLink to="/misc" class="mb-3 inline-block text-sm font-semibold text-accent">‹ Разное</RouterLink>
  <h1 class="mb-3 text-2xl font-bold">Фильмы  для семейного просмотра</h1>

  <p v-if="!app.moviesReady" class="card mb-4 bg-amber-50 p-4 text-sm text-amber-900" data-test="movies-not-ready">Чтобы сохранять фильмы, выполни <code>planner_movies.sql</code> в Supabase (SQL Editor) и обнови страницу.</p>
  <template v-else>
    <div class="mb-4 grid grid-cols-2 gap-2 text-center" data-test="movies-counts">
      <div class="card p-2.5"><div class="text-lg font-bold leading-tight">{{ app.queueMovies.length }}</div><div class="text-[11px] text-mute">хочу посмотреть</div></div>
      <div class="card p-2.5"><div class="text-lg font-bold leading-tight">{{ app.watchedMovies.length }}</div><div class="text-[11px] text-mute">посмотрено</div></div>
    </div>

    <form class="mb-3 flex gap-2" @submit.prevent="add">
      <input v-model="text" class="input min-w-0 flex-1" maxlength="300" placeholder="Что хочется посмотреть?" aria-label="Новый фильм" data-test="movie-input" />
      <button class="btn-primary shrink-0" :disabled="!text.trim()">В список</button>
    </form>
    <input v-if="app.movies.length" v-model="search" type="search" class="input mb-2 !py-2 !text-sm" placeholder="Поиск по названию, режиссёру, стране и заметкам" aria-label="Поиск по фильмам" data-test="movie-search" />
    <MovieFilters v-if="app.movies.length" v-model="filter" v-model:favorites="favoritesOnly" />

    <div v-if="!app.movies.length" class="card p-8 text-center text-mute" data-test="movies-empty">Добавь первый фильм, который хочется посмотреть</div>

    <section v-if="queue.length" class="mb-5" data-test="movies-queue">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Хочу посмотреть · {{ queue.length }}</h2>
      <!-- при поиске и фильтрах порядок не меняем: видна только часть списка -->
      <div v-drag-sort="(ids: string[]) => app.reorderMovies(ids)" class="card divide-y divide-line" data-test="movie-queue-list">
        <MovieCard v-for="m in queue" :key="m.id" :data-id="m.id" :movie="m" :sortable="!narrowed" />
      </div>
    </section>

    <section v-if="app.watchedMovies.length && (!filtered || app.watchedMovies.some(m => (!favOn || !!m.favorite) && matchesMovieFilter(filter, m)))" class="mb-5" data-test="movies-watched">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Посмотрено</h2>
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
      <p class="mb-2 text-sm" data-test="movies-summary"><b>{{ watched.length }}</b> {{ moviesWord(watched.length) }}</p>
      <div v-if="watched.length" class="card divide-y divide-line"><MovieCard v-for="m in watched" :key="m.id" :movie="m" /></div>
      <p v-else class="card p-4 text-center text-sm text-mute">За этот период посмотренных фильмов нет</p>
    </section>

    <p v-if="narrowed && !queue.length && !watched.length" class="card p-6 text-center text-mute" data-test="movies-nothing">{{ favOn && !app.movies.some(m => m.favorite) ? 'В избранном пока пусто: отметь фильм сердечком в его карточке' : 'Ничего не нашлось' }}<template v-if="filtered && app.movies.some(m => m.favorite)"> — попробуй ослабить фильтры</template></p>
  </template>
</template>
