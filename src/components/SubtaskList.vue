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

const toggle = (s: Subtask) => save(list.value.map(x => (x.id === s.id ? { ...x, done: !x.done } : x)))
const remove = (s: Subtask) => save(list.value.filter(x => x.id !== s.id))
function rename(s: Subtask, e: Event) {
  const title = (e.target as HTMLInputElement).value.trim()
  if (!title) return remove(s)
  if (title !== s.title) void save(list.value.map(x => (x.id === s.id ? { ...x, title } : x)))
}
/** Добавить: несколько строк (например, вставили список) — несколько подзадач */
function add() {
  const titles = draft.value.split(/\r?\n/).map(x => x.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
  if (!titles.length) return
  draft.value = ''
  void save([...list.value, ...titles.map(title => ({ id: uid(), title: title.slice(0, 300), done: false }))])
}
function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text') ?? ''
  if (!text.includes('\n')) return
  e.preventDefault(); draft.value += text; add()
}
const onSort = (ids: string[]) => save(ids.map(id => list.value.find(x => x.id === id)!).filter(Boolean))
</script>

<template>
  <!-- В строке задачи: только отметки -->
  <ul v-if="compact" class="space-y-1 pb-2 pl-12 pr-3" data-test="subtasks-compact">
    <li v-for="s in list" :key="s.id" class="flex items-start gap-2 text-sm">
      <input type="checkbox" class="mt-0.5 h-4 w-4 shrink-0 accent-[#1F6F6B]" :checked="s.done" :aria-label="s.title" @change="toggle(s)" />
      <span :class="s.done && 'text-mute line-through'">{{ s.title }}</span>
    </li>
  </ul>

  <!-- В карточке: правка, порядок, удаление, добавление -->
  <div v-else class="text-xs text-mute" data-test="subtasks">
    <div class="mb-1 flex items-center justify-between">
      <span>Подзадачи<template v-if="list.length"> · {{ list.filter(x => x.done).length }}/{{ list.length }}</template></span>
    </div>
    <ul v-if="list.length" v-drag-sort="onSort" class="mb-1.5 divide-y divide-line rounded-xl border border-line bg-white">
      <li v-for="s in list" :key="s.id" :data-id="s.id" class="flex items-center gap-2 px-2 py-1.5">
        <span data-drag-handle class="shrink-0 cursor-grab touch-none select-none px-0.5 text-sm leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить подзадачу">⋮⋮</span>
        <input type="checkbox" class="h-4 w-4 shrink-0 accent-[#1F6F6B]" :checked="s.done" :aria-label="'Выполнено: ' + s.title" data-test="subtask-check" @change="toggle(s)" />
        <input :value="s.title" class="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none" :class="s.done && 'text-mute line-through'" maxlength="300"
          :aria-label="'Подзадача: ' + s.title" @change="rename(s, $event)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
        <button type="button" class="shrink-0 px-1 text-base leading-none text-mute hover:text-red-700" :aria-label="'Удалить подзадачу ' + s.title" @click="remove(s)">×</button>
      </li>
    </ul>
    <input v-model="draft" class="input !py-1.5 text-sm" maxlength="2000" placeholder="+ подзадача (Enter — добавить)" aria-label="Новая подзадача" data-test="subtask-add"
      @keydown.enter.prevent="add" @paste="onPaste" />
  </div>
</template>
