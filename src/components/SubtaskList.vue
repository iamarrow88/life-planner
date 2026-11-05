<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import type { Subtask, Task } from '../types'
import { vDragSort } from '../lib/dragSort'

/**
 * Подзадачи задачи. Всё сохраняется сразу: отметка, добавление, переименование, удаление, порядок.
 * compact — в строке задачи: только отметки; полный вид — в карточке
 */
const props = defineProps<{ task: Task; compact?: boolean }>()
const app = useApp()
const list = computed(() => props.task.subtasks ?? [])
const draft = ref('')
const uid = () => crypto.randomUUID()
const save = (next: Subtask[]) => app.setSubtasks(props.task.id, next)

// ---- Повтор: изменения списка идут и в следующие задачи, если так выбрано. Выбор один на весь повтор
const rule = computed(() => (props.compact || !props.task.recurrence_id || props.task.status === 'done' || !app.checklistSyncReady ? null : app.data.recurrences.find(r => r.id === props.task.recurrence_id) ?? null))
const syncOn = computed(() => rule.value?.checklist_sync === true)
const asking = ref(false)
/** Добавили, удалили, переименовали, переставили. Отметка «сделано» сюда не относится */
async function change(next: Subtask[]) {
  if (!await save(next) || !rule.value) return
  if (rule.value.checklist_sync === true) void app.copySubtasksToNext(rule.value.id, props.task.id, next)
  else if (rule.value.checklist_sync == null) asking.value = true
}
function choose(on: boolean) {
  asking.value = false
  if (rule.value) void app.setChecklistSync(rule.value.id, on, props.task.id, list.value)
}

const toggle = (s: Subtask) => save(list.value.map(x => (x.id === s.id ? { ...x, done: !x.done } : x)))
const remove = (s: Subtask) => change(list.value.filter(x => x.id !== s.id))
function rename(s: Subtask, e: Event) {
  const title = (e.target as HTMLInputElement).value.trim()
  if (!title) return remove(s)
  if (title !== s.title) void change(list.value.map(x => (x.id === s.id ? { ...x, title } : x)))
}
/** Добавить: несколько строк (например, вставили список) — несколько подзадач */
function add() {
  const titles = draft.value.split(/\r?\n/).map(x => x.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
  if (!titles.length) return
  draft.value = ''
  void change([...list.value, ...titles.map(title => ({ id: uid(), title: title.slice(0, 300), done: false }))])
}
function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text') ?? ''
  if (!text.includes('\n')) return
  e.preventDefault(); draft.value += text; add()
}
const onSort = (ids: string[]) => change(ids.map(id => list.value.find(x => x.id === id)!).filter(Boolean))
</script>

<template>
  <!-- В строке задачи: только отметки -->
  <ul v-if="compact" class="space-y-1 pb-2 pl-12 pr-3" data-test="subtasks-compact">
    <li v-for="s in list" :key="s.id" class="flex items-start gap-2 text-sm">
      <input type="checkbox" class="mt-0.5 h-4 w-4 shrink-0 accent-[#1D7052]" :checked="s.done" :aria-label="s.title" @change="toggle(s)" />
      <span :class="s.done && 'text-mute line-through'">{{ s.title }}</span>
    </li>
  </ul>

  <!-- В карточке: правка, порядок, удаление, добавление -->
  <div v-else class="text-xs text-mute" data-test="subtasks">
    <div class="mb-1 flex items-center justify-between">
      <span>Подзадачи<template v-if="list.length"> · {{ list.filter(x => x.done).length }}/{{ list.length }}</template></span>
      <button v-if="rule" type="button" class="rounded-full border px-2 py-0.5 text-xs font-medium transition" :class="syncOn ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-white text-mute'"
        :aria-pressed="syncOn" :title="syncOn ? 'Изменения подзадач идут и в следующие задачи. Нажми, чтобы менять только эту' : 'Подзадачи меняются только в этой задаче. Нажми, чтобы менять и в следующих'" data-test="subtasks-sync" @click="choose(!syncOn)">⧉ и в следующих</button>
    </div>
    <ul v-if="list.length" v-drag-sort="onSort" class="mb-1.5 divide-y divide-line rounded-xl border border-line bg-white">
      <li v-for="s in list" :key="s.id" :data-id="s.id" class="flex items-center gap-2 px-2 py-1.5">
        <span data-drag-handle class="shrink-0 cursor-grab touch-none select-none px-0.5 text-sm leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить подзадачу">⋮⋮</span>
        <input type="checkbox" class="h-4 w-4 shrink-0 accent-[#1D7052]" :checked="s.done" :aria-label="'Выполнено: ' + s.title" data-test="subtask-check" @change="toggle(s)" />
        <input :value="s.title" class="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none" :class="s.done && 'text-mute line-through'" maxlength="300"
          :aria-label="'Подзадача: ' + s.title" @change="rename(s, $event)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
        <button type="button" class="shrink-0 px-1 text-base leading-none text-mute hover:text-red-700" :aria-label="'Удалить подзадачу ' + s.title" @click="remove(s)">×</button>
      </li>
    </ul>
    <input v-model="draft" class="input !py-1.5 text-sm" maxlength="2000" placeholder="+ подзадача (Enter — добавить)" aria-label="Новая подзадача" data-test="subtask-add"
      @keydown.enter.prevent="add" @paste="onPaste" />
    <!-- Первое изменение подзадач в этом повторе: спрашиваем один раз -->
    <div v-if="asking && rule" class="mt-1.5 rounded-xl border border-line bg-white p-2.5" role="group" aria-label="Куда применить изменения подзадач" data-test="subtasks-ask">
      <p class="mb-1.5 text-sm text-ink">Подзадачи менять только в этой задаче или ещё в следующих?</p>
      <div class="flex gap-1.5">
        <button type="button" class="chip flex-1 justify-center py-1.5" data-test="subtasks-only" @click="choose(false)">Только в этой</button>
        <button type="button" class="chip flex-1 justify-center py-1.5" data-test="subtasks-all" @click="choose(true)">И в следующих</button>
      </div>
      <p class="mt-1.5">Выбор запомнится для всего повтора, его можно поменять кнопкой «⧉ и в следующих». Включение заменит подзадачи в следующих задачах этим списком.</p>
    </div>
  </div>
</template>
