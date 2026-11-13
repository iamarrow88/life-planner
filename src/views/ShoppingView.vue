<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import type { Task } from '../types'
import { vDragSort } from '../lib/dragSort'
import { shortDate } from '../lib/time'
import ShoppingCard from '../components/ShoppingCard.vue'

/** Список покупок: пункты, добавленные вручную, и невыполненные задачи с выбранным тегом */
const app = useApp()
const text = ref('')
async function add() {
  const title = text.value.trim(); if (!title) return
  if (await app.addShoppingItem(title)) text.value = ''
}
const left = computed(() => app.toBuyItems.length + app.shoppingTasks.length)
const bought = computed(() => app.boughtItems.length + app.boughtTasks.length)
function clearBought() {
  const n = app.boughtItems.length
  if (n && window.confirm(`Убрать из списка купленное (${n})?`)) void app.removeShoppingItems(app.boughtItems.map(i => i.id))
}
const overdue = (t: Task) => !!t.due_date && t.due_date < app.today

// ---- Тег задач
const editTag = ref(false)
const tagText = ref('')
function startTag() { tagText.value = app.shoppingTag; editTag.value = true }
async function saveTag() { if (await app.saveShoppingTag(tagText.value)) editTag.value = false }
</script>

<template>
  <RouterLink to="/misc" class="mb-3 inline-block text-sm font-semibold text-accent">‹ Разное</RouterLink>
  <h1 class="mb-3 text-2xl font-bold">Список покупок</h1>

  <p v-if="!app.shoppingReady" class="card mb-4 bg-amber-50 p-4 text-sm text-amber-900" data-test="shopping-not-ready">Чтобы сохранять список покупок, выполни <code>planner_shopping.sql</code> в Supabase (SQL Editor) и обнови страницу.</p>
  <template v-else>
    <form class="mb-4 flex gap-2" @submit.prevent="add">
      <input v-model="text" class="input min-w-0 flex-1" maxlength="300" placeholder="Что купить?" aria-label="Новая покупка" data-test="shopping-input" />
      <button class="btn-primary shrink-0" :disabled="!text.trim()">Добавить</button>
    </form>

    <div v-if="!left && !bought" class="card mb-5 p-8 text-center text-mute" data-test="shopping-empty">Список пуст. Добавь, что нужно купить</div>

    <section v-if="left" class="mb-5" data-test="shopping-to-buy">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Купить · {{ left }}</h2>
      <div v-if="app.toBuyItems.length" v-drag-sort="(ids: string[]) => app.reorderShoppingItems(ids)" class="card divide-y divide-line" :class="{ 'mb-2': app.shoppingTasks.length > 0 }" data-test="shopping-list">
        <ShoppingCard v-for="i in app.toBuyItems" :key="i.id" :data-id="i.id" :item="i" sortable />
      </div>
      <div v-if="app.shoppingTasks.length" class="card divide-y divide-line" data-test="shopping-tasks">
        <div v-for="t in app.shoppingTasks" :key="t.id" class="flex items-center gap-2.5 px-3 py-2.5">
          <button type="button" class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-line transition hover:border-accent" aria-label="Отметить купленным" data-test="shopping-task-check" @click="app.toggleDone(t)"></button>
          <button type="button" class="min-w-0 flex-1 text-left" data-test="shopping-task-open" @click="app.openTask(t.id)">
            <span class="block break-words text-[15px]">{{ t.title }}</span>
            <span class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-mute">
              <span class="font-medium text-accent">задача</span>
              <span v-if="t.due_date" :class="overdue(t) && 'font-medium text-red-600'">{{ shortDate(t.due_date) }}</span>
            </span>
          </button>
        </div>
      </div>
    </section>

    <section v-if="bought" class="mb-5" data-test="shopping-bought">
      <div class="mb-2 flex items-baseline justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-mute">Куплено · {{ bought }}</h2>
        <button v-if="app.boughtItems.length" type="button" class="text-xs font-semibold text-accent" data-test="shopping-clear" @click="clearBought">Очистить</button>
      </div>
      <div class="card divide-y divide-line">
        <ShoppingCard v-for="i in app.boughtItems" :key="i.id" :item="i" />
        <div v-for="t in app.boughtTasks" :key="t.id" class="flex items-center gap-2.5 px-3 py-2.5">
          <button type="button" class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-success bg-success text-white" aria-label="Купить снова" data-test="shopping-task-uncheck" @click="app.toggleDone(t)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
          </button>
          <button type="button" class="min-w-0 flex-1 text-left" @click="app.openTask(t.id)">
            <span class="block break-words text-[15px] text-mute line-through">{{ t.title }}</span>
            <span class="mt-0.5 block text-xs text-mute">задача, выполнена сегодня</span>
          </button>
        </div>
      </div>
    </section>

    <section v-if="app.tagsReady" class="card p-3 text-sm" data-test="shopping-tag">
      <template v-if="!editTag">
        <p class="text-mute">
          <template v-if="app.shoppingTag">Сюда попадают невыполненные задачи с тегом <b class="text-ink">#{{ app.shoppingTag }}</b>.</template>
          <template v-else>Задачи сюда не попадают.</template>
          <button type="button" class="ml-1 font-semibold text-accent" data-test="shopping-tag-edit" @click="startTag">Изменить</button>
        </p>
      </template>
      <form v-else class="space-y-2" @submit.prevent="saveTag">
        <label class="block text-xs text-mute" for="shopping-tag-input">Тег задач для списка покупок</label>
        <div class="flex gap-2">
          <input id="shopping-tag-input" v-model="tagText" list="shopping-tag-list" class="input min-w-0 flex-1 !py-2" maxlength="50" placeholder="покупки" data-test="shopping-tag-input" />
          <datalist id="shopping-tag-list"><option v-for="g in app.allTags" :key="g.tag" :value="g.tag" /></datalist>
          <button class="btn-primary shrink-0 !py-2" data-test="shopping-tag-save">Сохранить</button>
        </div>
        <p class="text-xs text-mute">Оставь пустым, чтобы задачи сюда не попадали. <button type="button" class="font-semibold text-accent" @click="editTag = false">Отмена</button></p>
      </form>
    </section>
  </template>
</template>
