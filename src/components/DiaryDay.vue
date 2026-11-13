<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { addDays, longDate, shortDate } from '../lib/time'
import AutoTextarea from './AutoTextarea.vue'

/** День в дневнике: ♥ «важный день», настроение 1–5 и запись. Текст сохраняется сам — через секунду после паузы и при уходе из поля */
const props = defineProps<{ day: string }>()
const app = useApp()
const entry = computed(() => app.journalFor(props.day))

/** Вопросы-подсказки: у каждого дня свой, чтобы пустые поля не выглядели одинаково */
const PROMPTS = ['Что стоит запомнить из этого дня?', 'Что было важным за день?', 'Что хочется зафиксировать?', 'Расскажи про день', 'Как день по ощущениям?', 'За что можно сказать себе спасибо?', 'Что получилось лучше, чем ждала?']
const prompt = computed(() => PROMPTS[Math.abs(Math.floor(new Date(props.day + 'T00:00:00Z').getTime() / 86400000)) % PROMPTS.length])
const label = computed(() => (props.day === app.today ? 'Сегодня' : props.day === addDays(app.today, -1) ? 'Вчера' : shortDate(props.day)))
const MOODS = ['очень плохо', 'плохо', 'нормально', 'хорошо', 'отлично']

const text = ref(entry.value?.text ?? '')
const focused = ref(false)
// данные обновились (другое устройство, восстановление) — подхватываем, если сейчас не печатают
watch(() => entry.value?.text, v => { if (!focused.value) text.value = v ?? '' })
let timer: number | undefined
function schedule() { window.clearTimeout(timer); timer = window.setTimeout(flush, 1000) }
async function flush() {
  window.clearTimeout(timer)
  const v = text.value.trim() ? text.value : null
  if ((entry.value?.text ?? null) === v) return
  await app.saveJournal(props.day, { text: v })
}
onBeforeUnmount(() => { void flush() })
function setMood(m: number) { void app.saveJournal(props.day, { mood: entry.value?.mood === m ? null : m }) }
function toggleFav() { void app.saveJournal(props.day, { favorite: !entry.value?.favorite }) }
</script>

<template>
  <article class="card p-3" :class="day === app.today && 'border-accent'" :data-day-entry="day" data-test="diary-day">
    <div class="mb-2 flex items-center gap-2">
      <span class="rounded-full px-3 py-1 text-sm font-semibold" :class="day === app.today ? 'bg-accent-soft text-accent-deep ring-1 ring-accent/30' : 'bg-accent-soft text-accent'" :title="longDate(day)">{{ label }}</span>
      <button type="button" class="grid h-8 w-8 place-items-center rounded-full transition hover:bg-accent-soft" :class="entry?.favorite ? 'text-rose-500' : 'text-mute/60'"
        :aria-pressed="!!entry?.favorite" :aria-label="entry?.favorite ? 'Убрать отметку «важный день»' : 'Отметить как важный день'" data-test="diary-fav" @click="toggleFav">
        <svg width="18" height="18" viewBox="0 0 24 24" :fill="entry?.favorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-9.2-9A4.9 4.9 0 0 1 12 6.2 4.9 4.9 0 0 1 21.2 11C19 15.6 12 20 12 20z" /></svg>
      </button>
      <div class="ml-auto flex items-center gap-1 rounded-full bg-white/70 px-2 py-1.5" role="group" aria-label="Настроение" data-test="diary-mood">
        <button v-for="(m, i) in MOODS" :key="i" type="button" class="h-3.5 w-3.5 rounded-full transition"
          :class="entry?.mood && i < entry.mood ? 'bg-accent' : 'bg-line hover:bg-accent/40'" :aria-pressed="entry?.mood === i + 1" :aria-label="'Настроение: ' + m" :title="m" @click="setMood(i + 1)"></button>
      </div>
    </div>
    <AutoTextarea v-model="text" :min-rows="day === app.today ? 2 : 1" :maxlength="20000" :placeholder="prompt" class="!bg-white/60" data-test="diary-text"
      @update:model-value="schedule" @focus="focused = true" @blur="focused = false; flush()" />
  </article>
</template>
