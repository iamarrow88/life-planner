<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { insertTag, parseTags, typingTag } from '../lib/tags'

/**
 * Теги под строкой быстрого ввода: подсказки, пока набирают «#…», кнопка 🏷 со списком всех тегов
 * (на телефоне до «#» далеко) и предпросмотр — какие теги распознаны
 */
const text = defineModel<string>({ required: true })
/** large — кнопка 🏷 высотой с поле выбора (рядом с отбором по сфере на «Входящих» и «Сегодня») */
defineProps<{ large?: boolean }>()
const app = useApp()
const open = ref(false)
const partial = computed(() => typingTag(text.value))
const found = computed(() => parseTags(text.value).tags)
/** Подсказки к набираемому тегу; без набора — все теги (по кнопке 🏷) */
const options = computed(() => {
  const p = partial.value
  const all = app.allTags.map(x => x.tag).filter(t => !found.value.includes(t) || t === p)
  if (p !== null) return all.filter(t => t.startsWith(p) && t !== p).slice(0, 8)
  return open.value ? all.slice(0, 30) : []
})
function pick(tag: string) { text.value = insertTag(text.value, tag); open.value = false }
</script>

<template>
  <!-- large: кнопка встаёт в строку родителя (display: contents), а список тегов — всегда отдельной строкой ниже,
       поэтому кнопка не прыгает, когда список открывают -->
  <div v-if="app.tagsReady" :class="large ? 'contents' : 'flex w-full flex-wrap items-center gap-1.5 text-xs'" data-test="quick-tags">
    <button type="button" class="chip" :class="[large ? 'h-[34px] !rounded-xl px-3 text-sm' : 'py-0.5', open && 'chip-on']" :aria-expanded="open" title="Теги" aria-label="Выбрать тег" data-test="quick-tags-toggle" @click="open = !open">🏷</button>
    <div v-if="found.length || options.length || (open && !app.allTags.length)" :class="large ? 'flex basis-full flex-wrap items-center gap-1.5 text-xs' : 'contents'" data-test="quick-tags-list">
      <span v-for="t in found" :key="'f' + t" class="text-accent">#{{ t }}</span>
      <template v-if="options.length">
        <span v-if="found.length" class="text-mute">·</span>
        <button v-for="t in options" :key="t" type="button" class="chip py-0.5 hover:chip-on" data-test="quick-tag-option" @click="pick(t)">#{{ t }}</button>
      </template>
      <span v-else-if="open && !app.allTags.length" class="text-mute">Тегов пока нет — напиши в задаче «#тег».</span>
    </div>
  </div>
  <!-- В базе ещё нет тегов: «#…» останется просто текстом — подсказываем, что сделать -->
  <p v-else-if="text.includes('#')" class="w-full text-xs text-amber-800" data-test="tags-not-ready">
    Теги пока не включены: выполни <code>planner_tags.sql</code> в Supabase (SQL Editor) и обнови страницу. До этого «#…» сохранится как обычный текст.
  </p>
</template>
