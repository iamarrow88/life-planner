<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import type { Movie, MoviePatch } from '../types'
import { shortDate, ymd } from '../lib/time'
import AutoTextarea from './AutoTextarea.vue'

/** Фильм: в строке — главное, по нажатию строка сменяется полями. Правки сохраняются сами, когда уходишь из поля */
const props = defineProps<{ movie: Movie; sortable?: boolean }>()
const app = useApp()
const open = ref(false)
const title = ref('')
const director = ref('')
const year = ref<number | string | null>(null)
const watchedOn = ref('')
const noteText = ref('')

function show() {
  const m = props.movie
  title.value = m.title; director.value = m.director ?? ''; year.value = m.year
  watchedOn.value = m.watched_on ?? ''; noteText.value = ''
  open.value = true
}
/** Год вне допустимых значений не сохраняем: поле вернётся к прежнему */
const yearOrNull = (v: number | string | null) => (v === '' || v == null ? null : Math.round(Number(v)))
async function save() {
  const m = props.movie, patch: MoviePatch = {}
  const t = title.value.trim()
  if (t && t !== m.title) patch.title = t
  if (!t) title.value = m.title
  const d = director.value.trim() || null
  if (d !== (m.director ?? null)) patch.director = d
  const y = yearOrNull(year.value)
  if (y !== null && !(y >= 1880 && y <= 2100)) year.value = m.year
  else if (y !== (m.year ?? null)) patch.year = y
  if (m.status === 'watched' && watchedOn.value && watchedOn.value !== m.watched_on) patch.watched_on = watchedOn.value
  if (Object.keys(patch).length) await app.updateMovie(m.id, patch)
}
async function hide() { open.value = false; await save() }

/** Дата с годом, если он не текущий: посмотренное бывает и прошлых лет */
const dayLabel = (d: string) => shortDate(d) + (d.slice(0, 4) !== app.today.slice(0, 4) ? ' ' + d.slice(0, 4) : '')
const when = (iso: string) => dayLabel(ymd(new Date(iso)))

// ---- Оценка и заметки
function rate(n: number) { void app.updateMovie(props.movie.id, { rating: props.movie.rating === n ? null : n }) }
const notes = computed(() => [...(props.movie.notes ?? [])].reverse())
async function addNote() {
  const text = noteText.value.trim(); if (!text) return
  if (await app.addMovieNote(props.movie, text)) noteText.value = ''
}
function remove() { if (window.confirm(`Удалить фильм «${props.movie.title}» вместе с заметками?`)) void app.removeMovie(props.movie.id) }
const Handle = 'shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent'
</script>

<template>
  <div>
    <div v-if="!open" class="flex items-start gap-2 px-3 py-2.5">
      <span v-if="sortable" data-drag-handle class="-ml-1 mt-0.5" :class="Handle" role="button" aria-label="Перетащить фильм" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
      <button type="button" class="min-w-0 flex-1 text-left" aria-expanded="false" data-test="movie-open" @click="show">
        <span class="block break-words text-[15px] font-medium">{{ movie.title }}</span>
        <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
          <span v-if="movie.director">{{ movie.director }}</span>
          <span v-if="movie.year">{{ movie.year }}</span>
          <template v-if="movie.status === 'watched'">
            <span v-if="movie.watched_on">посмотрела {{ dayLabel(movie.watched_on) }}</span>
            <span v-if="movie.rating" class="text-amber-600" :aria-label="'Оценка ' + movie.rating + ' из 5'">{{ '★'.repeat(movie.rating) }}</span>
          </template>
          <span v-if="movie.notes?.length" title="Заметки">📝 {{ movie.notes.length }}</span>
        </span>
      </button>
      <button v-if="movie.status === 'queue'" type="button" class="chip shrink-0 py-1 hover:chip-on" data-test="movie-watch" @click="app.watchMovie(movie)">Посмотрела</button>
    </div>

    <div v-if="open" class="space-y-2 p-3" data-test="movie-edit" @focusout="save">
      <div class="flex items-start gap-1.5">
        <span v-if="sortable" data-drag-handle class="-ml-1 mt-3" :class="Handle" role="button" aria-label="Перетащить фильм" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
        <AutoTextarea v-model="title" class="min-w-0 flex-1" single-line :maxlength="300" required placeholder="Название фильма" />
        <button type="button" class="grid h-9 w-8 shrink-0 place-items-center text-xl leading-none text-mute hover:text-accent" aria-label="Свернуть" title="Свернуть" data-test="movie-close" @click="hide">×</button>
      </div>
      <div class="grid grid-cols-[1fr_6rem] gap-2">
        <label class="min-w-0 text-xs text-mute">Режиссёр
          <input v-model="director" class="input mt-1 !px-2 !py-2 !text-sm" maxlength="200" data-test="movie-director" />
        </label>
        <label class="min-w-0 text-xs text-mute">Год
          <input v-model="year" type="number" min="1880" max="2100" inputmode="numeric" class="input mt-1 !px-2 !py-2 !text-sm" data-test="movie-year" />
        </label>
      </div>
      <label v-if="movie.status === 'watched'" class="block text-xs text-mute">Посмотрела
        <input v-model="watchedOn" type="date" class="input mt-1 !px-2 !py-2 !text-sm" data-test="movie-watched-on" />
      </label>
      <div v-if="movie.status === 'watched'" class="flex items-center gap-1 text-xs text-mute" data-test="movie-rating">
        <span class="mr-1">Оценка</span>
        <button v-for="n in 5" :key="n" type="button" class="text-xl leading-none" :class="(movie.rating ?? 0) >= n ? 'text-amber-500' : 'text-line'" :aria-label="'Оценка ' + n" @click="rate(n)">★</button>
      </div>

      <!-- Заметки: новые сверху, с датой -->
      <div class="rounded-xl bg-bg p-2.5" data-test="movie-notes">
        <div class="mb-1.5 text-xs font-semibold text-mute">Заметки<span v-if="notes.length"> · {{ notes.length }}</span></div>
        <form class="space-y-1.5" @submit.prevent="addNote">
          <AutoTextarea v-model="noteText" :min-rows="2" :maxlength="4000" placeholder="Кто посоветовал, мысль, впечатление" />
          <div class="flex justify-end">
            <button class="btn-ghost !px-3 !py-1 !text-sm" :disabled="!noteText.trim()" data-test="movie-note-add">Добавить заметку</button>
          </div>
        </form>
        <ul v-if="notes.length" class="mt-2 divide-y divide-line">
          <li v-for="n in notes" :key="n.id" class="flex items-start gap-2 py-1.5 text-sm" data-test="movie-note">
            <span class="min-w-0 flex-1 whitespace-pre-line break-words">{{ n.text }}<span class="mt-0.5 block text-[11px] text-mute">{{ when(n.at) }}</span></span>
            <button type="button" class="shrink-0 px-1 text-mute hover:text-red-600" aria-label="Удалить заметку" @click="app.removeMovieNote(movie, n.id)">×</button>
          </li>
        </ul>
      </div>

      <div class="flex flex-wrap items-center gap-2 pt-1">
        <button v-if="movie.status === 'queue'" type="button" class="btn-primary !px-3 !py-1.5 !text-sm" data-test="movie-watch-card" @click="app.watchMovie(movie)">Посмотрела</button>
        <button v-else type="button" class="btn-ghost !px-3 !py-1.5 !text-sm" title="Например, отметила по ошибке или хочется пересмотреть" data-test="movie-requeue" @click="open = false; app.requeueMovie(movie)">Вернуть в «Хочу посмотреть»</button>
        <button type="button" class="ml-auto text-xs text-mute hover:text-red-600" data-test="movie-remove" @click="remove">Удалить</button>
      </div>
    </div>
  </div>
</template>
