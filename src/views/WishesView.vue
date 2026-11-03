<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { Wish } from '../types'
import { vDragSort } from '../lib/dragSort'
import WishCard from '../components/WishCard.vue'

/** «Мои желания»: всё, что хочется, в одном месте — без дат и сроков */
const app = useApp()
const FILTER_KEY = 'kola-wishes-category'
const NO_CATEGORY = '__none'
const text = ref('')
const search = ref('')
const showDone = ref(false)
/** Выбранная категория: '' — все, NO_CATEGORY — без категории; запоминается на устройстве */
const selected = ref((() => { try { return localStorage.getItem(FILTER_KEY) ?? '' } catch { return '' } })())
watch(selected, v => { try { localStorage.setItem(FILTER_KEY, v) } catch { /* не запомним — не страшно */ } })

const q = computed(() => search.value.trim().toLowerCase())
const fits = (w: Wish) => {
  if (selected.value === NO_CATEGORY ? !!w.category : selected.value && w.category !== selected.value) return false
  return !q.value || w.title.toLowerCase().includes(q.value) || (w.note ?? '').toLowerCase().includes(q.value)
}
const active = computed(() => app.activeWishes.filter(fits))
/** Исполнившиеся свёрнуты, но при поиске раскрыты: иначе найденное не было бы видно */
const doneOpen = computed(() => showDone.value || !!q.value)
const done = computed(() => app.fulfilledWishes.filter(fits))
/** Кнопки категорий: только те, где что-то есть, с числом ещё не исполненных */
const chips = computed(() => {
  const n = new Map<string, number>()
  for (const w of app.wishes) if (w.category) n.set(w.category, (n.get(w.category) ?? 0) + (w.fulfilled_at ? 0 : 1))
  return [...n.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([name, count]) => ({ name, count }))
})
const hasUncategorized = computed(() => app.wishes.some(w => !w.category))
// категории больше нет (последнее желание удалили или перенесли) — показываем все, иначе список был бы пустым без причины
watch(() => [selected.value, chips.value.length, hasUncategorized.value], () => {
  const s = selected.value
  if (s === NO_CATEGORY ? !hasUncategorized.value : s && !chips.value.some(c => c.name === s)) selected.value = ''
}, { immediate: true })

async function add() {
  const title = text.value.trim(); if (!title) return
  const category = selected.value && selected.value !== NO_CATEGORY ? selected.value : null
  if (await app.addWish(title, category)) text.value = ''
}
</script>

<template>
  <RouterLink to="/misc" class="mb-3 inline-block text-sm font-semibold text-accent">‹ Разное</RouterLink>
  <h1 class="mb-1 text-2xl font-bold">Мои желания</h1>
  <p class="mb-4 text-sm text-mute">Всё, что хочется, в одном месте. Без сроков и обязательств.</p>

  <p v-if="!app.wishesReady" class="card mb-4 bg-amber-50 p-4 text-sm text-amber-900" data-test="wishes-not-ready">Чтобы сохранять желания, выполни <code>planner_wishes.sql</code> в Supabase (SQL Editor) и обнови страницу.</p>
  <template v-else>
    <form class="mb-3 flex gap-2" @submit.prevent="add">
      <input v-model="text" class="input min-w-0 flex-1" maxlength="300" placeholder="Чего хочется?" aria-label="Новое желание" data-test="wish-input" />
      <button class="btn-primary shrink-0" :disabled="!text.trim()">Добавить</button>
    </form>

    <div v-if="chips.length" class="mb-3 flex flex-wrap items-center gap-1.5" data-test="wish-categories">
      <button type="button" class="chip py-1 text-sm" :class="!selected && 'chip-on'" @click="selected = ''">Все</button>
      <button v-for="c in chips" :key="c.name" type="button" class="chip py-1 text-sm" :class="selected === c.name && 'chip-on'" @click="selected = c.name">
        {{ c.name }}<span class="ml-1 text-xs opacity-70">{{ c.count }}</span>
      </button>
      <button v-if="hasUncategorized" type="button" class="chip py-1 text-sm" :class="selected === NO_CATEGORY && 'chip-on'" @click="selected = NO_CATEGORY">Без категории</button>
    </div>

    <input v-if="app.wishes.length" v-model="search" type="search" class="input mb-3 !py-2 !text-sm" placeholder="Поиск по названию и заметке" aria-label="Поиск по желаниям" data-test="wish-search" />

    <!-- при поиске найденное среди исполнившихся показываем сразу: блок ниже раскрыт -->
    <div v-if="!active.length && !(q && done.length)" class="card p-8 text-center text-mute" data-test="wishes-empty">
      {{ q ? 'Ничего не нашлось' : app.wishes.length ? 'Здесь пока пусто' : 'Запиши первое желание — просто чтобы не забыть ✨' }}
    </div>
    <!-- при поиске порядок не меняем: видна только часть списка -->
    <div v-else-if="active.length" v-drag-sort="(ids: string[]) => app.reorderWishes(ids)" class="card divide-y divide-line" data-test="wish-list">
      <WishCard v-for="w in active" :key="w.id" :data-id="w.id" :wish="w" :sortable="!q" />
    </div>

    <section v-if="done.length" class="mt-5" data-test="wishes-done">
      <button type="button" class="mb-2 text-sm font-semibold text-mute hover:text-accent" :aria-expanded="doneOpen" :disabled="!!q" @click="showDone = !showDone">✨ Исполнилось · {{ done.length }}<template v-if="!q"> {{ showDone ? '▴' : '▾' }}</template></button>
      <div v-if="doneOpen" class="card divide-y divide-line">
        <WishCard v-for="w in done" :key="w.id" :wish="w" />
      </div>
    </section>
  </template>
</template>
