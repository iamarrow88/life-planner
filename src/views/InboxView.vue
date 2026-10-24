<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { addDays, shortDate } from '../lib/time'
import TaskRow from '../components/TaskRow.vue'
import EstimateInput from '../components/EstimateInput.vue'
import DoneBlock from '../components/DoneBlock.vue'

const app = useApp()
const text = ref('')
const estimate = ref<number | null>(null)

async function add() {
  const title = text.value.trim()
  if (!title) return
  const est = estimate.value
  text.value = ''; estimate.value = null
  await app.addTask({ title, status: 'inbox', estimate_minutes: est })
}
/** Выполненные задачи «из входящих»: те, которые так и не получили дату */
const doneUndated = computed(() => app.data.tasks.filter(t => t.status === 'done' && !t.due_date))
/** Предустановленное время для быстрого планирования */
const TIMES = ['09:00', '15:00', '19:00']
/** Для какой задачи и на какую дату сейчас выбирается время (всплывающее окно) */
const choosing = ref<{ id: string; date: string } | null>(null)
const choose = (id: string, date: string) => { choosing.value = choosing.value?.id === id && choosing.value.date === date ? null : { id, date } }
const dateLabel = (d: string) => d === app.today ? 'Сегодня' : d === addDays(app.today, 1) ? 'Завтра' : shortDate(d)
/** Зафиксировать дату и время (null — «без времени»); задача уходит из «Входящих» в план. Для задачи со временем напоминание — за 10 минут */
async function plan(id: string, date: string, time: string | null) {
  choosing.value = null
  await app.updateTask(id, {
    status: 'planned', due_date: date,
    start_time: time ? `${time}:00` : null, remind_before_minutes: time ? 10 : null,
  })
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') choosing.value = null }
/** Клик куда угодно, кроме самого окна и кнопок планирования, закрывает окно */
const onDocClick = (e: MouseEvent) => {
  const el = e.target as HTMLElement | null
  if (choosing.value && !el?.closest('[role=dialog], [data-quick]')) choosing.value = null
}
onMounted(() => { window.addEventListener('keydown', onKey); document.addEventListener('click', onDocClick) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); document.removeEventListener('click', onDocClick) })
/** Календарь выбора даты. Скрытое поле даты само по клику не открывается, поэтому вызываем showPicker() */
function openPicker(e: MouseEvent) {
  const input = (e.currentTarget as HTMLElement).parentElement?.querySelector('input')
  if (!input) return
  try { input.showPicker() } catch { input.focus(); input.click() }
}
/** Дату выбрали в календаре — теперь спрашиваем время */
function pickedDate(id: string, e: Event) {
  const el = e.target as HTMLInputElement
  if (el.value) { choosing.value = { id, date: el.value }; el.value = '' }
}
const setSphere = (id: string, v: string) => app.updateTask(id, { sphere_id: v || null })
</script>

<template>
  <h1 class="mb-1 text-2xl font-bold">Входящие</h1>
  <p class="mb-4 text-sm text-mute">Всё, что не хочется держать в голове. Разберёшь потом.</p>

  <form class="mb-5 flex flex-wrap gap-2" @submit.prevent="add">
    <input v-model="text" class="input !w-auto min-w-[12rem] flex-1" placeholder="Что нужно запомнить?" autofocus />
    <EstimateInput v-model="estimate" />
    <button class="btn-primary shrink-0" :disabled="!text.trim()">Добавить</button>
  </form>

  <div v-if="!app.inbox.length && !app.loading" class="card p-8 text-center text-mute">
    Пусто — отличное состояние ✨
  </div>
  <ul v-else class="space-y-3">
    <li v-for="t in app.inbox" :key="t.id" class="card">
      <TaskRow :task="t" />
      <div class="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <button data-quick class="chip hover:chip-on" :class="choosing?.id === t.id && choosing.date === app.today && 'chip-on'" @click="choose(t.id, app.today)">Сегодня</button>
        <button data-quick class="chip hover:chip-on" :class="choosing?.id === t.id && choosing.date === addDays(app.today, 1) && 'chip-on'" @click="choose(t.id, addDays(app.today, 1))">Завтра</button>
        <span class="relative inline-flex">
          <button data-quick type="button" class="chip hover:chip-on" @click="openPicker">Дата…</button>
          <input type="date" tabindex="-1" aria-hidden="true" class="pointer-events-none absolute inset-0 opacity-0" :min="app.today"
            @change="e => pickedDate(t.id, e)" />
        </span>
        <select class="chip bg-white pr-6" :value="t.sphere_id ?? ''" @change="e => setSphere(t.id, (e.target as HTMLSelectElement).value)">
          <option value="">Без сферы</option>
          <option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <button class="ml-auto text-xs text-mute hover:text-red-600" @click="app.removeTask(t.id)">Удалить</button>
      </div>
      <!-- Всплывающее окно: во сколько? -->
      <template v-if="choosing?.id === t.id">
        <div class="relative">
          <div role="dialog" aria-label="Выбери время" class="absolute left-3 top-1 z-20 w-64 rounded-2xl border border-line bg-white p-3 shadow-lg">
            <div class="mb-2 flex items-center justify-between text-sm">
              <span class="font-semibold">{{ dateLabel(choosing.date) }} — во сколько?</span>
              <button type="button" class="text-lg leading-none text-mute" aria-label="Закрыть" @click="choosing = null">×</button>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <button v-for="tm in TIMES" :key="tm" type="button" class="chip justify-center py-1.5 text-sm hover:chip-on" @click="plan(t.id, choosing.date, tm)">{{ tm }}</button>
            </div>
            <button type="button" class="chip mt-2 w-full justify-center py-1.5 text-sm hover:chip-on" @click="plan(t.id, choosing.date, null)">Без времени</button>
          </div>
        </div>
      </template>
    </li>
  </ul>

  <DoneBlock :tasks="doneUndated" />
</template>
