<script setup lang="ts">
// Блок «Выполнено»: переданные выполненные задачи (экран сам решает, какие), зачёркнутые; сверху — выполненные недавно.
import { computed, ref } from 'vue'
import { dayOf, shortDate } from '../lib/time'
import type { Task } from '../types'
import TaskRow from './TaskRow.vue'

const PAGE = 20
const props = defineProps<{ tasks: Task[] }>()
const open = ref(true)
const shown = ref(PAGE)

/** Когда выполнена: done_at, а у старых записей без него — дата задачи */
const stamp = (t: { done_at: string | null; due_date: string | null }) => t.done_at ?? t.due_date ?? ''
const all = computed(() => props.tasks.filter(t => t.status === 'done').sort((a, b) => stamp(b).localeCompare(stamp(a))))
const visible = computed(() => all.value.slice(0, shown.value))
const doneDay = (t: { done_at: string | null }) => (t.done_at ? shortDate(dayOf(t.done_at)) : '')
</script>

<template>
  <section v-if="all.length" class="mt-6" data-testid="done-block">
    <button class="mb-2 flex w-full items-center justify-between text-left" @click="open = !open">
      <span class="text-sm font-semibold uppercase tracking-wide text-mute">Выполнено · {{ all.length }}</span>
      <span class="text-xs text-mute">{{ open ? '▴' : '▾' }}</span>
    </button>
    <template v-if="open">
      <div class="card divide-y divide-line">
        <div v-for="t in visible" :key="t.id">
          <TaskRow :task="t">
            <span v-if="doneDay(t)" class="shrink-0 text-xs text-mute" title="Когда выполнено">{{ doneDay(t) }}</span>
          </TaskRow>
        </div>
      </div>
      <button v-if="all.length > shown" class="mt-2 text-sm font-semibold text-accent" @click="shown += PAGE">Показать ещё</button>
    </template>
  </section>
</template>
