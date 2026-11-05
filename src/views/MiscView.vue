<script setup lang="ts">
import { computed } from 'vue'
import { useApp } from '../stores/app'
import NavIcon from '../components/NavIcon.vue'

/** «Разное»: разделы, которым не нужна своя вкладка */
const app = useApp()
const monthlyLeft = computed(() => app.monthlyItems.filter(i => !app.monthlyDone(i)).length)
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
    <RouterLink to="/movies" class="card flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="open-movies">
      <NavIcon name="movies" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">Фильмы</span>
        <span class="block text-xs text-mute">Хочу посмотреть: {{ app.queueMovies.length }} · посмотрено: {{ app.watchedMovies.length }}</span>
      </span>
      <span class="text-mute">›</span>
    </RouterLink>
    <RouterLink to="/monthly" class="card flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="open-monthly">
      <NavIcon name="monthly" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">Ежемесячный чек-лист</span>
        <span class="block text-xs text-mute">{{ app.monthlyItems.length ? (monthlyLeft ? 'Осталось в этом месяце: ' + monthlyLeft + ' из ' + app.monthlyItems.length : 'В этом месяце всё сделано ✓') : 'Дела раз в месяц, в любой день' }}</span>
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
