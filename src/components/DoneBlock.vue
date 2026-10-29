<script setup lang="ts">
// Блок «Выполнено»: переданные выполненные задачи (экран сам решает, какие), зачёркнутые; сверху — выполненные недавно.
import { computed, ref } from 'vue'
import { dayOf, shortDate } from '../lib/time'
import type { Task } from '../types'
import TaskRow from './TaskRow.vue'

const PAGE = 20
/** since — первый день периода (например, начало недели): более ранние выполненные скрыты, их можно показать кнопкой */
const props = defineProps<{ tasks: Task[]; since?: string }>()
const open = ref(true)
const shown = ref(PAGE)

/** Когда выполнена: done_at, а у старых записей без него — дата задачи */
const stamp = (t: { done_at: string | null; due_date: string | null }) => t.done_at ?? t.due_date ?? ''
const all = computed(() => props.tasks.filter(t => t.status === 'done').sort((a, b) => stamp(b).localeCompare(stamp(a))))
const dayStr = (t: { done_at: string | null; due_date: string | null }) => (t.done_at ? dayOf(t.done_at) : (t.due_date ?? ''))
const recent = computed(() => (props.since ? all.value.filter(t => dayStr(t) >= props.since!) : all.value))
const older = computed(() => (props.since ? all.value.filter(t => dayStr(t) < props.since!) : []))
const showOlder = ref(false)
const shownOlder = ref(PAGE)
const visible = computed(() => recent.value.slice(0, shown.value))
const visibleOlder = computed(() => older.value.slice(0, shownOlder.value))
const doneDay = (t: { done_at: string | null }) => (t.done_at ? shortDate(dayOf(t.done_at)) : '')
</script>

<template>
  <section v-if="all.length" class="mt-6" data-testid="done-block">
    <button class="mb-2 flex w-full items-center justify-between text-left" @click="open = !open">
      <span class="text-sm font-semibold uppercase tracking-wide text-mute">Выполнено · {{ recent.length }}</span>
      <span class="text-lg text-mute">{{ open ? '▴' : '▾' }}</span>
    </button>
    <template v-if="open">
      <p v-if="!recent.length" class="card px-4 py-3 text-sm text-mute" data-testid="done-empty">На этой неделе пока ничего не выполнено.</p>
      <div v-else class="card divide-y divide-line">
        <div v-for="t in visible" :key="t.id">
          <TaskRow :task="t">
            <span v-if="doneDay(t)" class="shrink-0 text-xs text-mute" title="Когда выполнено">{{ doneDay(t) }}</span>
          </TaskRow>
        </div>
      </div>
      <button v-if="recent.length > shown" class="mt-2 block text-sm font-semibold text-accent" @click="shown += PAGE">Показать ещё</button>

      <!-- Выполнено раньше: заголовок всегда сверху списка, им же список сворачивается -->
      <template v-if="older.length">
        <button class="mb-2 mt-5 flex w-full items-center justify-between text-left" data-testid="done-older" :aria-expanded="showOlder" @click="showOlder = !showOlder; shownOlder = PAGE">
          <span class="text-sm font-semibold uppercase tracking-wide text-mute">Выполнено ранее · {{ older.length }}</span>
          <span class="text-lg text-mute">{{ showOlder ? '▴' : '▾' }}</span>
        </button>
        <template v-if="showOlder">
          <div class="card divide-y divide-line" data-testid="done-older-list">
            <div v-for="t in visibleOlder" :key="t.id">
              <TaskRow :task="t">
                <span v-if="doneDay(t)" class="shrink-0 text-xs text-mute" title="Когда выполнено">{{ doneDay(t) }}</span>
              </TaskRow>
            </div>
          </div>
          <button v-if="older.length > shownOlder" class="mt-2 block text-sm font-semibold text-accent" @click="shownOlder += PAGE">Показать ещё</button>
        </template>
      </template>
    </template>
  </section>
</template>
