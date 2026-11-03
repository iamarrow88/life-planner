<script setup lang="ts">
import { computed } from 'vue'
import { useApp, type PostponeKind } from '../stores/app'
import type { Task } from '../types'
import { fmtClock, fmtSec, hhmm, shortDate } from '../lib/time'
import { fmtMinutes } from '../lib/time'
import { fmtMoney } from '../lib/budget'
import { ref } from 'vue'
import SubtaskList from './SubtaskList.vue'

/** sortable — показать ручку ⋮⋮ для перетаскивания (список с v-drag-sort) */
// затраченное время правится в карточке задачи (⏱ Время), отдельной кнопки в строке нет
/** noTimer — без кнопки таймера (например, в планировании недели, где важнее название) */
const props = defineProps<{ task: Task; sortable?: boolean; noTimer?: boolean }>()
const app = useApp()
const sphere = computed(() => app.sphereById(props.task.sphere_id))
const project = computed(() => app.projectById(props.task.project_id))
const isRunning = computed(() => app.running?.task_id === props.task.id)
const done = computed(() => props.task.status === 'done')
const totals = computed(() => app.taskTotal(props.task.id))
const subs = computed(() => props.task.subtasks ?? [])
const showSubs = ref(false)
const liveSeconds = computed(() => (isRunning.value ? app.runningSeconds : 0))

// ---- «↷ Перенести»: у задач с датой — завтра, на выходные, на следующую неделю (время начала сохраняется)
const canPostpone = computed(() => !done.value && !!props.task.due_date && !props.noTimer)
const postponeMenu = ref<{ top: number; left: number } | null>(null)
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const dayName = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return `${WD[new Date(y, m - 1, dd).getDay()]}, ${shortDate(d)}` }
const postponeOptions = computed(() => ([['tomorrow', 'Завтра'], ['weekend', 'На выходные'], ['nextweek', 'На следующую неделю']] as const)
  .map(([kind, label]) => ({ kind, label, to: app.postponeTarget(kind) })))
function openPostpone(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  // меню справа под кнопкой, но не за краем экрана
  // меню «висит» поверх страницы: прокрутили список — закрываем, чтобы оно не оторвалось от задачи
  window.addEventListener('scroll', closePostpone, { capture: true, once: true })
  choosing.value = false
  postponeMenu.value = { top: Math.min(r.bottom + 4, window.innerHeight - 260), left: Math.max(8, Math.min(r.right - 264, window.innerWidth - 272)) }
}
function closePostpone() { postponeMenu.value = null }
async function postpone(kind: PostponeKind) { postponeMenu.value = null; await app.postponeTask(props.task.id, kind) }
/** «Выбрать…»: своя дата и время (по умолчанию — завтра, время задачи) */
const choosing = ref(false)
const customDate = ref('')
const customTime = ref('')
function startChoose() { choosing.value = true; customDate.value = app.postponeTarget('tomorrow'); customTime.value = hhmm(props.task.start_time) }
async function postponeCustom() {
  if (!customDate.value) return
  postponeMenu.value = null
  await app.postponeTask(props.task.id, { date: customDate.value, time: customTime.value })
}
</script>

<template>
  <div>
  <div class="flex items-center gap-3 px-3 py-2.5">
    <span v-if="sortable && app.orderReady" data-drag-handle class="-ml-1 -mr-1.5 shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить задачу" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
    <button class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition"
      :class="done ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'"
      :aria-label="done ? 'Вернуть в работу' : 'Выполнено'" @click="app.toggleDone(task)">
      <svg v-if="done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
    </button>
    <div class="min-w-0 flex-1">
      <button class="block w-full truncate text-left text-[15px] hover:text-accent" :class="done && 'text-mute line-through'" @click="app.openTask(task.id)">{{ task.title }}</button>
      <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
        <span v-if="task.recurrence_id" title="Повторяющаяся" class="font-semibold text-accent">↻</span>
        <button v-if="subs.length" type="button" class="font-medium hover:text-accent" :class="subs.every(s => s.done) && 'text-accent'" :aria-expanded="showSubs"
          :title="showSubs ? 'Скрыть подзадачи' : 'Показать подзадачи'" data-test="subtask-progress" @click="showSubs = !showSubs">☑ {{ subs.filter(s => s.done).length }}/{{ subs.length }}</button>
        <span v-if="task.note" title="Есть описание" class="font-semibold">≡</span>
        <span v-if="task.start_time" class="font-medium text-ink/70">{{ hhmm(task.start_time) }}<span v-if="task.remind_before_minutes != null" title="Напомнит"> 🔔</span></span>
        <span v-if="sphere" class="inline-flex items-center gap-1">
          <span class="h-2 w-2 rounded-full" :style="{ background: sphere.color }"></span>{{ sphere.name }}<template v-if="project"> › {{ project.name }}</template>
        </span>
        <template v-if="task.tags?.length">
          <button v-for="g in task.tags.slice(0, 2)" :key="g" type="button" class="rounded-full bg-accent-soft px-1.5 text-[11px] font-medium text-accent hover:brightness-95" :title="'Все задачи с тегом #' + g" data-test="task-tag" @click="app.openSearch('#' + g + ' ')">#{{ g }}</button>
          <span v-if="task.tags.length > 2" class="text-[11px]" :title="task.tags.slice(2).map(g => '#' + g).join(' ')">+{{ task.tags.length - 2 }}</span>
        </template>
        <span v-if="isRunning" class="font-semibold tabular-nums text-accent">⏱ идёт {{ fmtClock(liveSeconds) }}</span>
        <span v-if="task.estimate_minutes">план {{ fmtMinutes(task.estimate_minutes) }}</span>
        <span v-if="Number(task.budget) > 0" class="font-medium text-ink/70" data-test="task-budget">{{ fmtMoney(Number(task.budget)) }}</span>
        <span v-if="totals.week > 0">неделя {{ fmtSec(totals.week) }}</span>
        <span v-if="totals.month > 0">месяц {{ fmtSec(totals.month) }}</span>
      </div>
    </div>
    <slot />
    <button v-if="canPostpone" type="button" class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg text-mute transition hover:bg-accent-soft hover:text-accent"
      :class="postponeMenu && 'bg-accent-soft text-accent'" aria-label="Перенести задачу" title="Перенести: завтра, на выходные, на следующую неделю" data-test="postpone" @click="openPostpone">↷</button>
    <button v-if="!done && !noTimer" class="grid h-9 w-9 shrink-0 place-items-center rounded-full transition"
      :class="isRunning ? 'bg-accent text-white' : 'bg-accent-soft text-accent hover:brightness-95'"
      :aria-label="isRunning ? 'Остановить таймер' : 'Запустить таймер'"
      @click="isRunning ? app.stopTimer() : app.startTimer({ task_id: task.id })">
      <svg v-if="isRunning" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
    </button>
  </div>
  <SubtaskList v-if="showSubs && subs.length" :task="task" compact />
  <Teleport to="body">
    <template v-if="postponeMenu">
      <div class="fixed inset-0 z-40" @click="postponeMenu = null"></div>
      <div role="menu" :aria-label="'Перенести «' + task.title + '»'" class="fixed z-50 rounded-2xl border border-line bg-white p-1.5 shadow-lg" :style="{ top: postponeMenu.top + 'px', left: postponeMenu.left + 'px', width: '16.5rem' }" data-test="postpone-menu">
        <button v-for="o in postponeOptions" :key="o.kind" type="button" role="menuitem" class="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent-soft"
          :data-test="'postpone-' + o.kind" @click="postpone(o.kind)">
          <span class="whitespace-nowrap">{{ o.label }}</span><span class="whitespace-nowrap text-xs text-mute">{{ dayName(o.to) }}</span>
        </button>
        <button v-if="!choosing" type="button" role="menuitem" class="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent-soft" data-test="postpone-choose" @click="startChoose">
          <span class="whitespace-nowrap">Выбрать…</span><span class="whitespace-nowrap text-xs text-mute">дата и время</span>
        </button>
        <form v-else class="space-y-2 border-t border-line px-2 pb-1 pt-2" data-test="postpone-custom" @submit.prevent="postponeCustom">
          <div class="flex gap-1.5">
            <input v-model="customDate" type="date" class="input min-w-0 flex-1 !px-2 !py-1.5 !text-sm" :min="app.today" required aria-label="Новая дата" />
            <input v-model="customTime" type="time" class="input !w-24 !px-2 !py-1.5 !text-sm" aria-label="Время (необязательно)" title="Пусто — без времени" />
          </div>
          <button class="btn-primary w-full !py-1.5 !text-sm" :disabled="!customDate">Перенести</button>
        </form>
        <p v-if="task.start_time && !choosing" class="px-3 pb-1 pt-0.5 text-[11px] text-mute">Время {{ hhmm(task.start_time) }} сохранится</p>
      </div>
    </template>
  </Teleport>
  </div>
</template>
