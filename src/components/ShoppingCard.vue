<script setup lang="ts">
import { ref } from 'vue'
import { useApp } from '../stores/app'
import type { ShoppingItem, ShoppingPatch } from '../types'
import AutoTextarea from './AutoTextarea.vue'

/** Пункт списка покупок: в строке — отметка и название, по нажатию строка сменяется полями. Правки сохраняются сами */
const props = defineProps<{ item: ShoppingItem; sortable?: boolean }>()
const app = useApp()
const open = ref(false)
const title = ref('')
const note = ref('')

function show() { title.value = props.item.title; note.value = props.item.note ?? ''; open.value = true }
async function save() {
  const i = props.item, patch: ShoppingPatch = {}
  const t = title.value.trim()
  if (t && t !== i.title) patch.title = t
  if (!t) title.value = i.title
  const n = note.value.trim() || null
  if (n !== (i.note ?? null)) patch.note = n
  if (Object.keys(patch).length) await app.updateShoppingItem(i.id, patch)
}
async function hide() { open.value = false; await save() }
const remove = () => app.removeShoppingItems([props.item.id])
const Handle = 'shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent'
</script>

<template>
  <div>
    <div v-if="!open" class="flex items-center gap-2.5 px-3 py-2.5">
      <span v-if="sortable" data-drag-handle class="-ml-1" :class="Handle" role="button" aria-label="Перетащить пункт" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
      <button type="button" class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition" :class="item.done_at ? 'border-success bg-success text-white' : 'border-line hover:border-accent'"
        :aria-label="item.done_at ? 'Купить снова' : 'Отметить купленным'" :aria-pressed="!!item.done_at" data-test="shopping-check" @click="app.toggleShoppingItem(item)">
        <svg v-if="item.done_at" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
      </button>
      <button type="button" class="min-w-0 flex-1 text-left" aria-expanded="false" data-test="shopping-open" @click="show">
        <span class="block break-words text-[15px]" :class="item.done_at && 'text-mute line-through'">{{ item.title }}</span>
        <span v-if="item.note" class="mt-0.5 line-clamp-2 block whitespace-pre-line text-xs text-mute">{{ item.note }}</span>
      </button>
    </div>

    <div v-else class="space-y-2 p-3" data-test="shopping-edit" @focusout="save">
      <div class="flex items-start gap-1.5">
        <AutoTextarea v-model="title" class="min-w-0 flex-1" single-line :maxlength="300" required placeholder="Что купить" />
        <button type="button" class="grid h-9 w-8 shrink-0 place-items-center text-xl leading-none text-mute hover:text-accent" aria-label="Свернуть" title="Свернуть" data-test="shopping-close" @click="hide">×</button>
      </div>
      <AutoTextarea v-model="note" :min-rows="2" :maxlength="4000" placeholder="Заметка: сколько, где, какой марки" />
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" :class="item.done_at ? 'btn-ghost' : 'btn-primary'" class="!px-3 !py-1.5 !text-sm" data-test="shopping-toggle" @click="app.toggleShoppingItem(item)">{{ item.done_at ? 'Купить снова' : '✓ Куплено' }}</button>
        <button type="button" class="ml-auto text-xs text-mute hover:text-red-600" data-test="shopping-remove" @click="remove">Удалить</button>
      </div>
    </div>
  </div>
</template>
