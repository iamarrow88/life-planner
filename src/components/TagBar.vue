<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { matchesFilter, type TaskFilter } from '../lib/taskFilter'

/**
 * Все теги: число — сколько невыполненных задач с тегом в выбранной сфере и проекте (scope), самые частые первыми.
 * Нажатие выделяет тег, и в списке ниже остаются только задачи со всеми выделенными тегами
 */
const selected = defineModel<string[]>({ required: true })
const props = defineProps<{ scope?: TaskFilter }>()
const app = useApp()
const tags = computed(() => {
  const s = props.scope
  return app.openTagCounts(s && s.sphere ? t => matchesFilter({ ...s, tags: [] }, t) : undefined)
})
const MAX = 10
const expanded = ref(false)
// выделенные теги всегда на виду, даже если не входят в первые MAX
const ordered = computed(() => [...tags.value.filter(x => selected.value.includes(x.tag)), ...tags.value.filter(x => !selected.value.includes(x.tag))])
const shown = computed(() => (expanded.value ? tags.value : ordered.value.slice(0, Math.max(MAX, selected.value.length))))
const toggle = (tag: string) => { selected.value = selected.value.includes(tag) ? selected.value.filter(x => x !== tag) : [...selected.value, tag] }
</script>

<template>
  <div v-if="app.tagsReady && tags.length" class="mb-3 flex flex-wrap items-center gap-1.5 text-xs" data-test="tag-bar">
    <button v-for="x in shown" :key="x.tag" type="button" class="chip py-0.5" :class="selected.includes(x.tag) ? 'chip-on' : 'hover:chip-on'" :aria-pressed="selected.includes(x.tag)"
      :title="selected.includes(x.tag) ? 'Убрать из отбора' : 'Показать только задачи с тегом #' + x.tag" data-test="tag-bar-item" @click="toggle(x.tag)">#{{ x.tag }}<span v-if="x.count" class="ml-1 opacity-70">{{ x.count }}</span></button>
    <button v-if="tags.length > shown.length || expanded" type="button" class="font-semibold text-accent" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ expanded ? 'свернуть' : `ещё ${tags.length - shown.length}` }}
    </button>
  </div>
</template>
