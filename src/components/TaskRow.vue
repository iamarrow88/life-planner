<script setup lang="ts">
import { computed, inject } from 'vue'
import { useApp } from '../stores/app'
import { TAG_CLICK } from '../lib/taskFilter'
import type { Task } from '../types'
import { fmtClock, fmtSec, hhmm } from '../lib/time'
import { fmtMinutes } from '../lib/time'
import { fmtMoney } from '../lib/budget'
import { ref } from 'vue'
import SubtaskList from './SubtaskList.vue'
import PostponeOptions from './PostponeOptions.vue'

/** sortable — показать ручку ⋮⋮ для перетаскивания (список с v-drag-sort) */
// затраченное время правится в карточке задачи (⏱ Время), отдельной кнопки в строке нет
/** noTimer — без кнопки таймера (например, в планировании недели, где важнее название) */
/** wrapTitle — название переносится, а не обрезается; dense — для узкого блока сетки дня: кружок над названием, под ним только время, без кнопок */
const props = defineProps<{ task: Task; sortable?: boolean; noTimer?: boolean; wrapTitle?: boolean; dense?: boolean }>()
const app = useApp()
const sphere = computed(() => app.sphereById(props.task.sphere_id))
const project = computed(() => app.projectById(props.task.project_id))
const isRunning = computed(() => app.running?.task_id === props.task.id)
const done = computed(() => props.task.status === 'done')
const totals = computed(() => app.taskTotal(props.task.id))
const subs = computed(() => props.task.subtasks ?? [])
const showSubs = ref(false)
/** На экранах с отбором нажатие на тег добавляет его в отбор, на остальных — открывает поиск */
const onTagClick = inject<((tag: string) => void) | null>(TAG_CLICK, null)
const clickTag = (g: string) => (onTagClick ? onTagClick(g) : app.openSearch('#' + g + ' '))
const liveSeconds = computed(() => (isRunning.value ? app.runningSeconds : 0))

// ---- «↷ Перенести»: у задач с датой — завтра, на выходные, на следующую неделю (время начала сохраняется)
const canPostpone = computed(() => !done.value && !!props.task.due_date && !props.noTimer && !props.dense)
const postponeMenu = ref<{ top: number; left: number } | null>(null)
function openPostpone(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  // меню справа под кнопкой, но не за краем экрана
  // меню «висит» поверх страницы: прокрутили список — закрываем, чтобы оно не оторвалось от задачи
  window.addEventListener('scroll', closePostpone, { capture: true, once: true })
  postponeMenu.value = { top: Math.min(r.bottom + 4, window.innerHeight - 260), left: Math.max(8, Math.min(r.right - 264, window.innerWidth - 272)) }
}
function closePostpone() { postponeMenu.value = null }
</script>

<template>
  <!-- Цвет приоритета — в style.css; у выполненных задач его нет -->
  <div :class="task.priority && !done ? ['task-pri', 'task-pri-' + task.priority] : undefined">
  <div class="flex" :class="dense ? 'flex-col items-start gap-1 px-1.5 py-1.5' : 'items-center gap-3 px-3 py-2.5'">
    <span v-if="sortable && app.orderReady" data-drag-handle class="-ml-1 -mr-1.5 shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить задачу" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
    <button class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition"
      :class="done ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'"
      :aria-label="done ? 'Вернуть в работу' : 'Выполнено'" @click="app.toggleDone(task)">
      <svg v-if="done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
    </button>
    <div class="min-w-0 flex-1" :class="dense && 'w-full'">
      <button class="block w-full text-left hover:text-accent" :class="[dense ? 'text-[13px] leading-tight' : 'text-[15px]', dense || wrapTitle ? '[overflow-wrap:anywhere]' : 'truncate', done && 'text-mute line-through']" @click="app.openTask(task.id)">{{ task.title }}</button>
      <div v-if="dense" class="mt-0.5 text-xs font-medium text-ink/70">{{ hhmm(task.start_time) }}</div>
      <div v-else class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
        <span v-if="task.recurrence_id" title="Повторяющаяся" class="font-semibold text-accent">↻</span>
        <button v-if="subs.length" type="button" class="font-medium hover:text-accent" :class="subs.every(s => s.done) && 'text-accent'" :aria-expanded="showSubs"
          :title="showSubs ? 'Скрыть подзадачи' : 'Показать подзадачи'" data-test="subtask-progress" @click="showSubs = !showSubs">☑ {{ subs.filter(s => s.done).length }}/{{ subs.length }}</button>
        <span v-if="task.note" title="Есть описание" class="font-semibold">≡</span>
        <span v-if="task.start_time" class="font-medium text-ink/70">{{ hhmm(task.start_time) }}<span v-if="task.remind_before_minutes != null" title="Напомнит"> 🔔</span></span>
        <span v-if="sphere" class="inline-flex items-center gap-1">
          <span class="h-2 w-2 rounded-full" :style="{ background: sphere.color }"></span>{{ sphere.name }}<template v-if="project"> › {{ project.name }}</template>
        </span>
        <template v-if="task.tags?.length">
          <button v-for="g in task.tags.slice(0, 2)" :key="g" type="button" class="rounded-full bg-accent-soft px-1.5 text-[11px] font-medium text-accent hover:brightness-95" :title="'Задачи с тегом #' + g" data-test="task-tag" @click="clickTag(g)">#{{ g }}</button>
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
    <button v-if="!done && !noTimer && !dense" class="grid h-9 w-9 shrink-0 place-items-center rounded-full transition"
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
        <PostponeOptions :task="task" @close="postponeMenu = null" />
      </div>
    </template>
  </Teleport>
  </div>
</template>
