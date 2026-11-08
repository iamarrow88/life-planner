<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { dayOf, shortDate } from '../lib/time'
import { parseQuery } from '../lib/tags'
import { useBackdrop } from '../lib/backdrop'
import TaskRow from './TaskRow.vue'

/** Поиск задач по названию, описанию и тегам: «#звонки банк» — задачи с тегом «звонки», где есть слово «банк» */
const app = useApp()
const input = ref<HTMLInputElement | null>(null)
const q = computed({ get: () => app.searchQuery ?? '', set: v => { app.searchQuery = v } })
const showDone = ref(false)
const bd = useBackdrop(() => app.closeSearch())
watch(() => app.searchQuery !== null, open => { if (open) { showDone.value = false; void nextTick(() => input.value?.focus()) } })

const query = computed(() => parseQuery(q.value))
const results = computed(() => {
  const { tags, words } = query.value
  if (!tags.length && !words.length) return []
  return app.data.tasks.filter(t => {
    if (!tags.every(g => t.tags?.includes(g))) return false
    const hay = [t.title, t.note ?? '', ...(t.subtasks ?? []).map(s => s.title)].join(' ').toLowerCase()
    return words.every(w => hay.includes(w))
  })
})
/** Сначала невыполненные: с датой по дате, затем без даты; выполненные — свёрнуто, свежие сверху */
const open = computed(() => results.value.filter(t => t.status !== 'done')
  .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.start_time ?? '99').localeCompare(b.start_time ?? '99')))
const done = computed(() => results.value.filter(t => t.status === 'done').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')))
/** Нажали на тег под полем — добавить его в запрос (или убрать) */
function toggleTag(tag: string) {
  const parts = q.value.split(/\s+/).filter(Boolean)
  q.value = (parts.includes('#' + tag) ? parts.filter(p => p !== '#' + tag) : [...parts, '#' + tag]).join(' ') + ' '
  input.value?.focus()
}
const where = (t: { status: string; due_date: string | null }) => t.status === 'inbox' ? 'во входящих' : t.due_date ? shortDate(t.due_date) : 'без даты'
</script>

<template>
  <div v-if="app.searchQuery !== null" class="fixed inset-0 z-[25] flex items-start justify-center backdrop p-0 md:p-6" data-test="task-search"
    @pointerdown="bd.down" @click="bd.click" @keydown.esc="app.closeSearch()">
    <div class="flex max-h-full w-full max-w-xl flex-col gap-3 overflow-y-auto bg-bg p-4 md:max-h-[90vh] md:rounded-3xl md:p-5">
      <div class="flex items-center gap-2">
        <input ref="input" v-model="q" type="search" class="input flex-1" placeholder="Поиск: слова и #теги" aria-label="Поиск задач" data-test="search-input" />
        <button type="button" class="text-2xl leading-none text-mute" aria-label="Закрыть поиск" @click="app.closeSearch()">×</button>
      </div>
      <div v-if="app.allTags.length" class="flex flex-wrap gap-1.5 text-xs">
        <button v-for="x in app.allTags.slice(0, 20)" :key="x.tag" type="button" class="chip py-0.5" :class="query.tags.includes(x.tag) && 'chip-on'" @click="toggleTag(x.tag)">#{{ x.tag }} <span class="ml-1 text-mute">{{ x.count }}</span></button>
      </div>

      <p v-if="!query.tags.length && !query.words.length" class="text-sm text-mute">Набери слово из названия или описания, или выбери тег.</p>
      <p v-else-if="!results.length" class="text-sm text-mute" data-test="search-empty">Ничего не нашлось.</p>
      <template v-else>
        <div v-if="open.length" class="card divide-y divide-line" data-test="search-open">
          <TaskRow v-for="t in open" :key="t.id" :task="t"><span class="shrink-0 text-xs text-mute">{{ where(t) }}</span></TaskRow>
        </div>
        <div v-if="done.length">
          <button type="button" class="text-xs font-semibold text-mute" :aria-expanded="showDone" data-test="search-done-toggle" @click="showDone = !showDone">Выполненные ({{ done.length }}) {{ showDone ? '▴' : '▾' }}</button>
          <div v-if="showDone" class="card mt-1.5 divide-y divide-line">
            <TaskRow v-for="t in done" :key="t.id" :task="t"><span v-if="t.done_at" class="shrink-0 text-xs text-mute">{{ shortDate(dayOf(t.done_at)) }}</span></TaskRow>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
