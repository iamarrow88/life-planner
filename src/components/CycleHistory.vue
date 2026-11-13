<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { shortDate } from '../lib/time'
import { cycleHistory, dayRanges, daysBetween, type MissedDose, type PillMark } from '../lib/cycle'
import AutoTextarea from './AutoTextarea.vue'
import Icon from './Icon.vue'

const app = useApp()
const marks = ref<PillMark[]>([])
const loaded = ref(false)

/** Отметки таблеток — с начала первого курса по сегодня (в памяти приложения есть только сегодняшние) */
async function load() {
  const first = app.cycleCourses[0]
  marks.value = first && first.starts_on <= app.today ? ((await app.pillMarks(first.starts_on, app.today)) ?? []) : []
  loaded.value = true
}
watch(() => [app.cycleCourses.map(c => c.starts_on + c.ends_on).join(), app.today], load, { immediate: true })
watch(() => app.data.habitEntries, load, { deep: true }) // отметили таблетку на «Сегодня»

const minute = computed(() => Math.floor(app.now / 60000))
const hist = computed(() => {
  const d = new Date(minute.value * 60000)
  return cycleHistory({
    days: app.data.cycle?.days ?? [], courses: app.cycleCourses, marks: marks.value, today: app.today,
    nowMin: d.getHours() * 60 + d.getMinutes(),
    times: { morning: app.cycleSettings.morning_time, evening: app.cycleSettings.evening_time },
  })
})

const year = (d: string) => d.slice(0, 4)
const withYear = (d: string) => `${shortDate(d)} ${year(d)}`
/** «3–7 октября» / «30 октября – 2 ноября» / «5 октября» */
function range(a: string, b: string): string {
  if (a === b) return shortDate(a)
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8))}–${shortDate(b)}`
  return `${shortDate(a)} – ${shortDate(b)}`
}
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
}
const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`
const DOSE = { morning: 'утро', evening: 'вечер' } as const
/** Пропуски по дням: «12 октября: утро (09:00), вечер (21:00)» */
function missedByDay(list: MissedDose[]) {
  const map = new Map<string, MissedDose[]>()
  for (const m of list) map.set(m.day, [...(map.get(m.day) ?? []), m])
  return [...map.entries()].map(([day, ms]) => ({ day, text: ms.map(m => `${DOSE[m.dose]} (${m.time})`).join(', ') }))
}

// ---- Примечание ко всему циклу
const editing = ref<string | null>(null) // начало цикла, чьё примечание правим
const draft = ref('')
const saving = ref(false)
function editSummary(start: string, text: string | null) { editing.value = start; draft.value = text ?? '' }
async function saveSummary() {
  if (!editing.value) return
  saving.value = true
  if (await app.setCycleSummary(editing.value, draft.value)) editing.value = null
  saving.value = false
}

function print() {
  document.body.classList.add('print-cycle')
  const done = () => { document.body.classList.remove('print-cycle'); window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  window.print()
}
</script>

<template>
  <section class="print-area mt-6" data-test="cycle-history">
    <div class="mb-2 flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-mute print:text-base print:text-black">История циклов</h2>
      <button v-if="hist.cycles.length || hist.loose.length" type="button" class="btn-ghost !py-1.5 print:hidden" data-test="cycle-print" @click="print"><Icon name="print" :size="15" /> Печать</button>
    </div>
    <p class="mb-3 hidden text-xs print:block">Напечатано {{ withYear(app.today) }}</p>

    <p v-if="!hist.cycles.length && !hist.loose.length" class="text-sm text-mute">Пока пусто: отметь первый день цикла в календаре.</p>

    <article v-for="c in hist.cycles" :key="c.start" class="card mb-3 break-inside-avoid p-4 text-sm print:mb-4 print:rounded-none print:border-x-0 print:border-t-0 print:px-0" data-test="cycle-record">
      <h3 class="font-semibold">
        Цикл {{ withYear(c.start) }} – {{ c.end ? withYear(c.end) : 'идёт' }}
        <span class="font-normal text-mute">· {{ c.end ? days(c.length) : `день ${c.length}` }}</span>
      </h3>
      <div v-if="editing === c.start" class="mt-2 space-y-2 print:hidden" data-test="cycle-summary-form">
        <AutoTextarea v-model="draft" :maxlength="4000" placeholder="Как прошёл цикл в целом: самочувствие, лекарства, что сказать врачу…" />
        <div class="flex gap-2">
          <button type="button" class="btn-primary !py-1.5" :disabled="saving" data-test="cycle-summary-save" @click="saveSummary">Сохранить</button>
          <button type="button" class="btn-ghost !py-1.5" :disabled="saving" @click="editing = null">Отмена</button>
        </div>
      </div>
      <div v-else-if="c.summary" class="mt-2 flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2 print:bg-transparent print:px-0" data-test="cycle-summary">
        <p class="flex-1 whitespace-pre-line"><span class="font-medium">Примечание:</span> {{ c.summary }}</p>
        <button type="button" class="shrink-0 text-xs font-semibold text-accent print:hidden" data-test="cycle-summary-edit" @click="editSummary(c.start, c.summary)">Изменить</button>
      </div>
      <button v-else type="button" class="mt-1 text-xs font-semibold text-accent print:hidden" data-test="cycle-summary-add" @click="editSummary(c.start, null)">+ Примечание к циклу</button>
      <dl class="mt-2 space-y-1.5">
        <div class="flex gap-2"><dt class="w-28 shrink-0 text-mute">Менструация</dt>
          <dd>{{ c.periodDays.length ? dayRanges(c.periodDays).map(r => range(r[0], r[1])).join(', ') + ` (${days(c.periodDays.length)})` : 'не отмечена' }}</dd></div>
        <div class="flex gap-2"><dt class="w-28 shrink-0 text-mute">Таблетки</dt>
          <dd>{{ c.course ? `${range(c.course.starts_on, c.course.ends_on)} (${days(daysBetween(c.course.starts_on, c.course.ends_on) + 1)})` + (c.course.starts_on > app.today ? ' — впереди' : '') : 'курса не было' }}</dd></div>
        <div v-if="c.course && c.course.starts_on <= app.today" class="flex gap-2" data-test="cycle-missed"><dt class="w-28 shrink-0 text-mute">Пропуски</dt>
          <dd>
            <template v-if="!loaded">…</template>
            <template v-else-if="!c.missed.length">нет</template>
            <ul v-else class="space-y-0.5">
              <li v-for="m in missedByDay(c.missed)" :key="m.day"><span class="font-medium">{{ shortDate(m.day) }}:</span> {{ m.text }}</li>
            </ul>
          </dd></div>
        <div v-if="c.notes.length" class="flex gap-2"><dt class="w-28 shrink-0 text-mute">Заметки</dt>
          <dd><ul class="space-y-1">
            <li v-for="n in c.notes" :key="n.day"><span class="font-medium">{{ shortDate(n.day) }}:</span> <span class="whitespace-pre-line">{{ n.note }}</span></li>
          </ul></dd></div>
      </dl>
    </article>

    <article v-if="hist.loose.length" class="card mb-3 break-inside-avoid p-4 text-sm print:rounded-none print:border-x-0 print:border-t-0 print:px-0">
      <h3 class="font-semibold">Заметки до первого отмеченного цикла</h3>
      <ul class="mt-2 space-y-1">
        <li v-for="n in hist.loose" :key="n.day"><span class="font-medium">{{ withYear(n.day) }}:</span> <span class="whitespace-pre-line">{{ n.note }}</span></li>
      </ul>
    </article>
  </section>
</template>
