<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { isTag, normTag, uniqTags } from '../lib/tags'

/** Теги в карточке: чипы с ×, поле «+ тег» с подсказками; Enter, пробел или запятая добавляют тег */
const tags = defineModel<string[]>({ required: true })
const app = useApp()
const input = ref('')
const focused = ref(false)
const options = computed(() => {
  const p = normTag(input.value)
  return app.allTags.map(x => x.tag).filter(t => !tags.value.includes(t) && (!p || t.startsWith(p))).slice(0, p ? 8 : 12)
})
function add(raw = input.value) {
  const t = normTag(raw)
  if (isTag(t)) tags.value = uniqTags([...tags.value, t])
  input.value = ''
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { if (input.value.trim()) { e.preventDefault(); add() } else if (e.key === 'Enter') e.preventDefault() }
  else if (e.key === 'Backspace' && !input.value && tags.value.length) tags.value = tags.value.slice(0, -1)
}
const remove = (t: string) => { tags.value = tags.value.filter(x => x !== t) }
</script>

<template>
  <div class="text-xs text-mute" data-test="tag-input">
    Теги
    <div class="input mt-1 flex flex-wrap items-center gap-1.5 !py-1.5">
      <span v-for="t in tags" :key="t" class="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-sm text-accent">
        #{{ t }}<button type="button" class="leading-none text-accent/70 hover:text-red-700" :aria-label="'Убрать тег ' + t" @click="remove(t)">×</button>
      </span>
      <input v-model="input" class="min-w-[6rem] flex-1 bg-transparent text-[15px] text-ink outline-none" placeholder="+ тег" aria-label="Добавить тег"
        @keydown="onKey" @focus="focused = true" @blur="focused = false; add()" />
    </div>
    <div v-if="(focused || input.trim()) && options.length" class="mt-1.5 flex flex-wrap gap-1.5">
      <!-- mousedown: выбрать до того, как поле потеряет фокус -->
      <button v-for="t in options" :key="t" type="button" class="chip py-0.5 hover:chip-on" data-test="tag-option" @mousedown.prevent="add(t)">#{{ t }}</button>
    </div>
  </div>
</template>
