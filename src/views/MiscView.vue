<script setup lang="ts">
import { useApp } from '../stores/app'
import NavIcon from '../components/NavIcon.vue'

/** «Разное»: разделы, которым не нужна своя вкладка */
const app = useApp()
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold">Разное</h1>
  <div class="space-y-3">
    <RouterLink to="/library" class="card flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="open-library">
      <NavIcon name="library" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">Библиотека</span>
        <span class="block text-xs text-mute">Читаю: {{ app.readingBooks.length }} · в очереди: {{ app.queueBooks.length }} · прочитано: {{ app.doneBooks.length }}</span>
      </span>
      <span class="text-mute">›</span>
    </RouterLink>
    <RouterLink to="/wishes" class="card flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="open-wishes">
      <NavIcon name="wishes" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">Мои желания</span>
        <span class="block text-xs text-mute">Желаний: {{ app.activeWishes.length }} · исполнилось: {{ app.fulfilledWishes.length }}</span>
      </span>
      <span class="text-mute">›</span>
    </RouterLink>
  </div>
</template>
