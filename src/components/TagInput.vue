<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

// Поле теряет фокус в момент нажатия мыши, а клик засчитывается при отпускании. Если в этот промежуток вёрстка сдвинется
// (новый чип перенёс строку), кнопка уедет из-под курсора и клик пропадёт. Поэтому набранный текст становится тегом
// уже после отпускания; карточка перед сохранением забирает его сама — см. flush
let pressed = false
const onDown = () => { pressed = true }
const onUp = () => { pressed = false }
onMounted(() => { window.addEventListener('pointerdown', onDown, true); window.addEventListener('pointerup', onUp, true); window.addEventListener('pointercancel', onUp, true) })
onBeforeUnmount(() => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointerup', onUp, true); window.removeEventListener('pointercancel', onUp, true) })
function onBlur() {
  focused.value = false
  const later = () => setTimeout(() => add(), 0)
  if (pressed) window.addEventListener('pointerup', later, { once: true, capture: true }); else later()
}
/** Забрать набранный, но ещё не добавленный тег */
defineExpose({ flush: () => { if (input.value.trim()) add() } })
</script>

<template>
  <div class="relative text-xs text-mute" data-test="tag-input">
    Теги
    <div class="input mt-1 flex flex-wrap items-center gap-1.5 !py-1.5">
      <span v-for="t in tags" :key="t" class="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-sm text-accent">
        #{{ t }}<button type="button" class="leading-none text-accent/70 hover:text-red-700" :aria-label="'Убрать тег ' + t" @click="remove(t)">×</button>
      </span>
      <input v-model="input" class="min-w-[6rem] flex-1 bg-transparent text-[15px] text-ink outline-none" placeholder="+ тег" aria-label="Добавить тег"
        @keydown="onKey" @focus="focused = true" @blur="onBlur" />
    </div>
    <!-- Подсказки поверх карточки: появляются и исчезают, не сдвигая кнопки под курсором -->
    <div v-if="(focused || input.trim()) && options.length" class="absolute inset-x-0 top-full z-20 mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-lg" data-test="tag-options">
      <!-- mousedown: выбрать до того, как поле потеряет фокус -->
      <button v-for="t in options" :key="t" type="button" class="chip py-0.5 hover:chip-on" data-test="tag-option" @mousedown.prevent="add(t)">#{{ t }}</button>
    </div>
  </div>
</template>
