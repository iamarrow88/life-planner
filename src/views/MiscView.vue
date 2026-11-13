<script setup lang="ts">
import { computed } from 'vue'
import { useApp } from '../stores/app'
import NavIcon from '../components/NavIcon.vue'

/** «Разное»: разделы, которым не нужна своя вкладка */
const app = useApp()
const shoppingLeft = computed(() => app.toBuyItems.length + app.shoppingTasks.length)
const anyOn = computed(() => (['books', 'movies', 'shopping', 'monthly', 'wishes'] as const).some(k => app.modOn(k)))
const monthlyLeft = computed(() => app.monthlyItems.filter(i => !app.monthlyDone(i)).length)
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold">Разное</h1>
  <div class="space-y-3">
    <RouterLink v-if="app.modOn('books')" to="/library" class="card flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="open-library">
      <NavIcon name="library" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">Библиотека</span>
        <span class="block text-xs text-mute">Читаю: {{ app.readingBooks.length }} · в очереди: {{ app.queueBooks.length }} · прочитано: {{ app.doneBooks.length }}</span>
      </span>
      <span class="text-mute">›</span>
    </RouterLink>
    <RouterLink v-if="app.modOn('movies')" to="/movies" class="card flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="open-movies">
      <NavIcon name="movies" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">Фильмы</span>
        <span class="block text-xs text-mute">Хочу посмотреть: {{ app.queueMovies.length }} · посмотрено: {{ app.watchedMovies.length }}</span>
      </span>
      <span class="text-mute">›</span>
    </RouterLink>
    <RouterLink v-if="app.modOn('shopping')" to="/shopping" class="card flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="open-shopping">
      <NavIcon name="shopping" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">Список покупок</span>
        <span class="block text-xs text-mute">{{ shoppingLeft ? 'Купить: ' + shoppingLeft : 'Всё куплено' }}</span>
      </span>
      <span class="text-mute">›</span>
    </RouterLink>
    <RouterLink v-if="app.modOn('monthly')" to="/monthly" class="card flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="open-monthly">
      <NavIcon name="monthly" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">Ежемесячный чек-лист</span>
        <span class="block text-xs text-mute">{{ app.monthlyItems.length ? (monthlyLeft ? 'Осталось в этом месяце: ' + monthlyLeft + ' из ' + app.monthlyItems.length : 'В этом месяце всё сделано ✓') : 'Дела раз в месяц, в любой день' }}</span>
      </span>
      <span class="text-mute">›</span>
    </RouterLink>
    <RouterLink v-if="app.modOn('wishes')" to="/wishes" class="card flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="open-wishes">
      <NavIcon name="wishes" class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">Мои желания</span>
        <span class="block text-xs text-mute">Желаний: {{ app.activeWishes.length }} · исполнилось: {{ app.fulfilledWishes.length }}</span>
      </span>
      <span class="text-mute">›</span>
    </RouterLink>
    <p v-if="!anyOn" class="card p-4 text-sm text-mute">Все разделы выключены. Включить их можно во «Ещё» → «Модули».</p>
  </div>
</template>
