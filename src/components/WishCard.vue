<script setup lang="ts">
import { ref } from 'vue'
import { useApp } from '../stores/app'
import type { Wish, WishPatch } from '../types'
import { fmtMoney } from '../lib/budget'
import { shortDate, ymd } from '../lib/time'
import AutoTextarea from './AutoTextarea.vue'

/** Желание: в строке — главное, по нажатию строка сменяется полями (название и категория не дублируются). Правки сохраняются сами, когда уходишь из поля */
const props = defineProps<{ wish: Wish; sortable?: boolean }>()
const app = useApp()
const open = ref(false)
const title = ref('')
const note = ref('')
const url = ref('')
const price = ref<number | string | null>(null)
const category = ref('')
const newCategory = ref('')
const NEW_CATEGORY = '__new'
const addingCategory = ref(false)

function fill() {
  const w = props.wish
  title.value = w.title; note.value = w.note ?? ''; url.value = w.url ?? ''; price.value = w.price == null ? null : Number(w.price); category.value = w.category ?? ''
  addingCategory.value = false; newCategory.value = ''
}
function show() { fill(); open.value = true }
async function hide() { open.value = false; await save() }

/** Адрес без http(s):// дополняем; другие схемы (javascript: и т. п.) не принимаем */
function normalizeUrl(raw: string): string | null {
  const v = raw.trim(); if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  return /^[a-z][a-z0-9+.-]*:/i.test(v) && !/^[^/]+:\d/.test(v) ? null : 'https://' + v
}
const urlBad = ref(false)
async function save() {
  const w = props.wish, patch: WishPatch = {}
  const t = title.value.trim()
  if (t && t !== w.title) patch.title = t
  if (!t) title.value = w.title
  const n = note.value.trim() || null
  if (n !== (w.note ?? null)) patch.note = n
  const u = normalizeUrl(url.value)
  urlBad.value = !!url.value.trim() && !u
  if (!urlBad.value && u !== (w.url ?? null)) { patch.url = u; url.value = u ?? '' }
  const p = price.value === '' || price.value == null || !(Number(price.value) >= 0) ? null : Math.round(Number(price.value) * 100) / 100
  if (p !== (w.price == null ? null : Number(w.price))) patch.price = p
  if (Object.keys(patch).length) await app.updateWish(w.id, patch)
}
function onCategory() {
  if (category.value === NEW_CATEGORY) { category.value = props.wish.category ?? ''; addingCategory.value = true; return }
  void app.updateWish(props.wish.id, { category: category.value || null })
}
async function addCategory() {
  const c = newCategory.value.trim().slice(0, 60); if (!c) return
  if (await app.updateWish(props.wish.id, { category: c })) { category.value = c; addingCategory.value = false; newCategory.value = '' }
}
function fulfill() { open.value = false; void app.updateWish(props.wish.id, { fulfilled_at: new Date().toISOString() }) }
function restore() { void app.updateWish(props.wish.id, { fulfilled_at: null }) }
function remove() { if (window.confirm(`Удалить желание «${props.wish.title}»?`)) void app.removeWish(props.wish.id) }
const taskOf = () => (props.wish.task_id ? app.data.tasks.find(t => t.id === props.wish.task_id) ?? null : null)
const when = (iso: string) => shortDate(ymd(new Date(iso)))
</script>

<template>
  <div>
    <div v-if="!open" class="flex items-start gap-2 px-3 py-2.5">
      <span v-if="sortable" data-drag-handle class="-ml-1 mt-0.5 shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить желание" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
      <button type="button" class="min-w-0 flex-1 text-left" aria-expanded="false" data-test="wish-open" @click="show">
        <span class="block break-words text-[15px]" :class="wish.fulfilled_at && 'text-mute'">{{ wish.title }}</span>
        <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
          <span v-if="wish.category" class="rounded-full bg-accent-soft px-1.5 text-[11px] font-medium text-accent">{{ wish.category }}</span>
          <span v-if="wish.price != null" class="font-medium text-ink/70">{{ fmtMoney(Number(wish.price)) }}</span>
          <span v-if="wish.note" title="Есть заметка" class="font-semibold">≡</span>
          <span v-if="wish.fulfilled_at">✨ {{ when(wish.fulfilled_at) }}</span>
        </span>
      </button>
      <a v-if="wish.url" :href="wish.url" target="_blank" rel="noopener noreferrer" class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm" title="Открыть ссылку" aria-label="Открыть ссылку" data-test="wish-link">🔗</a>
    </div>

    <div v-else class="space-y-2 p-3" data-test="wish-edit" @focusout="save">
      <div class="flex items-start gap-1.5">
        <span v-if="sortable" data-drag-handle class="-ml-1 mt-3 shrink-0 cursor-grab touch-none select-none px-1 text-base leading-none text-mute/70 hover:text-accent" role="button" aria-label="Перетащить желание" title="Перетащи, чтобы изменить порядок">⋮⋮</span>
        <AutoTextarea v-model="title" class="min-w-0 flex-1" single-line :maxlength="300" required placeholder="Что хочется" />
        <button type="button" class="grid h-9 w-8 shrink-0 place-items-center text-xl leading-none text-mute hover:text-accent" aria-label="Свернуть" title="Свернуть" data-test="wish-close" @click="hide">×</button>
      </div>
      <AutoTextarea v-model="note" :min-rows="2" :maxlength="4000" placeholder="Заметка: размер, цвет, почему хочется" />
      <div class="flex items-center gap-1.5">
        <input v-model="url" type="url" inputmode="url" class="input min-w-0 flex-1 !py-2 !text-sm" maxlength="2000" placeholder="Ссылка" aria-label="Ссылка" data-test="wish-url" />
        <a v-if="wish.url" :href="wish.url" target="_blank" rel="noopener noreferrer" class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm" title="Открыть ссылку" aria-label="Открыть ссылку" data-test="wish-link">🔗</a>
      </div>
      <p v-if="urlBad" class="text-xs text-red-700">Такую ссылку сохранить нельзя: нужен адрес вида https://…</p>
      <div class="grid grid-cols-2 gap-2">
        <label class="min-w-0 text-xs text-mute">Цена, BYN
          <input v-model="price" type="number" min="0" step="0.01" inputmode="decimal" class="input mt-1 !px-2 !py-2 !text-sm" placeholder="примерно" data-test="wish-price" />
        </label>
        <label class="min-w-0 text-xs text-mute">Категория
          <select v-model="category" class="input mt-1 !px-2 !py-2 !text-sm" data-test="wish-category" @change="onCategory">
            <option value="">Без категории</option>
            <option v-for="c in app.wishCategories" :key="c" :value="c">{{ c }}</option>
            <option :value="NEW_CATEGORY">＋ Новая…</option>
          </select>
        </label>
      </div>
      <form v-if="addingCategory" class="flex gap-1.5" data-test="wish-new-category" @submit.prevent="addCategory">
        <input v-model="newCategory" class="input min-w-0 flex-1 !py-1.5 !text-sm" maxlength="60" placeholder="Название категории" aria-label="Новая категория" autofocus />
        <button class="btn-ghost shrink-0 !py-1.5" :disabled="!newCategory.trim()">Добавить</button>
        <button type="button" class="shrink-0 px-1 text-mute" aria-label="Не добавлять категорию" @click="addingCategory = false; newCategory = ''">×</button>
      </form>
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <button v-if="!wish.fulfilled_at" type="button" class="btn-primary !px-3 !py-1.5 !text-sm" data-test="wish-fulfill" @click="fulfill">✨ Исполнилось</button>
        <button v-else type="button" class="btn-ghost !px-3 !py-1.5 !text-sm" data-test="wish-restore" @click="restore">Вернуть в желания</button>
        <span v-if="wish.fulfilled_at" class="text-xs text-mute">✨ {{ when(wish.fulfilled_at) }}</span>
        <button v-if="taskOf()" type="button" class="btn-ghost !px-3 !py-1.5 !text-sm" data-test="wish-open-task" @click="app.openTask(wish.task_id!)">Открыть задачу</button>
        <button v-else type="button" class="btn-ghost !px-3 !py-1.5 !text-sm" title="Создать задачу во «Входящих»; желание останется в списке" data-test="wish-to-task" @click="app.wishToTask(wish.id)">Сделать задачей</button>
        <button type="button" class="ml-auto text-xs text-mute hover:text-red-600" data-test="wish-remove" @click="remove">Удалить</button>
      </div>
    </div>
  </div>
</template>
