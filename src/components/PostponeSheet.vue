<script setup lang="ts">
import { computed } from 'vue'
import { useApp } from '../stores/app'
import PostponeOptions from './PostponeOptions.vue'

/** Окно переноса задачи: открывается кнопкой «Перенести…» в уведомлении на телефоне */
const app = useApp()
const task = computed(() => app.data.tasks.find(t => t.id === app.postponeSheetId) ?? null)
</script>

<template>
  <div v-if="task" class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" data-test="postpone-sheet" @click.self="app.closePostponeSheet()">
    <div role="dialog" :aria-label="'Перенести «' + task.title + '»'" class="w-full max-w-md rounded-t-3xl bg-bg p-4 md:rounded-3xl">
      <div class="mb-2 flex items-start justify-between gap-3 px-1">
        <div class="min-w-0">
          <h2 class="text-lg font-bold">Перенести</h2>
          <p class="break-words text-sm text-mute">{{ task.title }}</p>
        </div>
        <button type="button" class="text-2xl leading-none text-mute" aria-label="Закрыть" @click="app.closePostponeSheet()">×</button>
      </div>
      <div class="rounded-2xl border border-line bg-white p-1.5">
        <PostponeOptions :task="task" @close="app.closePostponeSheet()" />
      </div>
    </div>
  </div>
</template>
