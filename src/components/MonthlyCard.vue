<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import type { MonthlyItem, MonthlyPatch } from '../types'
import AutoTextarea from './AutoTextarea.vue'

/** Пункт ежемесячного чек-листа: в строке — отметка и название, по нажатию строка сменяется полями. Правки сохраняются сами */
const props = defineProps<{ item: MonthlyItem }>()
const app = useApp()
const open = ref(false)
const title = ref('')
const note = ref('')
const done = computed(() => app.monthlyDone(props.item))
const task = computed(() => app.monthlyTask(props.item))

function show() { title.value = props.item.title; note.value = props.item.note ?? ''; open.value = true }
async function save() {
  const i = props.item, patch: MonthlyPatch = {}
  const t = title.value.trim()
  if (t && t !== i.title) patch.title = t
  if (!t) title.value = i.title
  const n = note.value.trim() || null
  if (n !== (i.note ?? null)) patch.note = n
  if (Object.keys(patch).length) await app.updateMonthlyItem(i.id, patch)
}
async function hide() { open.value = false; await save() }
function remove() { if (window.confirm(`Удалить «${props.item.title}» из чек-листа?`)) void app.removeMonthlyItem(props.item.id) }
const Handle = 'shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent'
</script>

<template>
  <div>
    <div v-if="!open" class="flex items-center gap-2.5 px-3 py-2.5">
      <span data-drag-handle class="-ml-1" :class="Handle" role="button" aria-label="Перетащить пункт" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
      <button type="button" class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition" :class="done ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'"
        :aria-label="done ? 'Снять отметку' : 'Отметить сделанным'" :aria-pressed="done" data-test="monthly-check" @click="app.toggleMonthlyItem(item)">
        <svg v-if="done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
      </button>
      <button type="button" class="min-w-0 flex-1 text-left" aria-expanded="false" data-test="monthly-open" @click="show">
        <span class="block break-words text-[15px]" :class="done && 'text-mute line-through'">{{ item.title }}</span>
        <span v-if="item.note || task" class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
          <span v-if="item.note" title="Есть заметка" class="font-semibold">≡</span>
          <span v-if="task" class="font-medium text-accent">есть задача</span>
        </span>
      </button>
    </div>

    <div v-else class="space-y-2 p-3" data-test="monthly-edit" @focusout="save">
      <div class="flex items-start gap-1.5">
        <span data-drag-handle class="-ml-1 mt-3" :class="Handle" role="button" aria-label="Перетащить пункт" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
        <AutoTextarea v-model="title" class="min-w-0 flex-1" single-line :maxlength="300" required placeholder="Что сделать" />
        <button type="button" class="grid h-9 w-8 shrink-0 place-items-center text-xl leading-none text-mute hover:text-accent" aria-label="Свернуть" title="Свернуть" data-test="monthly-close" @click="hide">×</button>
      </div>
      <AutoTextarea v-model="note" :min-rows="2" :maxlength="4000" placeholder="Заметка: что купить, куда платить" />
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" :class="done ? 'btn-ghost' : 'btn-primary'" class="!px-3 !py-1.5 !text-sm" data-test="monthly-toggle" @click="app.toggleMonthlyItem(item)">{{ done ? 'Снять отметку' : '✓ Сделано' }}</button>
        <button v-if="task" type="button" class="btn-ghost !px-3 !py-1.5 !text-sm" data-test="monthly-open-task" @click="app.openTask(task.id)">Открыть задачу</button>
        <button v-else type="button" class="btn-ghost !px-3 !py-1.5 !text-sm" title="Создать задачу во «Входящих»; пункт останется в чек-листе и отметится, когда задачу выполнят" data-test="monthly-to-task" @click="app.monthlyToTask(item.id)">Сделать задачей</button>
        <button type="button" class="ml-auto text-xs text-mute hover:text-red-600" data-test="monthly-remove" @click="remove">Удалить</button>
      </div>
    </div>
  </div>
</template>
