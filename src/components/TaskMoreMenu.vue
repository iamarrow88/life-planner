<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import type { Task } from '../types'

/** Окно «Ещё» во «Входящих»: задача становится желанием, книгой, фильмом или покупкой и уходит из списка */
const props = defineProps<{ task: Task }>()
const emit = defineEmits<{ close: [] }>()
const app = useApp()
/** Задача, созданная из желания, уже связана с ним: второе такое же желание не нужно */
const fromWish = computed(() => app.wishes.some(w => w.task_id === props.task.id))
function convert(action: (t: Task) => Promise<boolean>) { emit('close'); void action(props.task) }

/** Снизу не хватает места (окно ушло бы под панель вкладок на телефоне) — открываем вверх */
const NAV_SPACE = 80
const box = ref<HTMLElement | null>(null)
const up = ref(false)
onMounted(async () => {
  await nextTick()
  const r = box.value?.getBoundingClientRect()
  if (r && r.bottom > window.innerHeight - NAV_SPACE) up.value = true
})
</script>

<template>
  <div class="relative">
    <div ref="box" role="dialog" aria-label="Ещё действия с задачей" class="absolute left-3 z-20 w-64 glass-pop p-3" :class="up ? 'bottom-full mb-1' : 'top-1'" data-test="inbox-more-menu">
      <div class="mb-2 flex items-center justify-between text-sm">
        <span class="font-semibold">Ещё</span>
        <button type="button" class="text-lg leading-none text-mute" aria-label="Закрыть" @click="emit('close')">×</button>
      </div>
      <div class="flex flex-col gap-1.5">
        <button v-if="app.wishesReady && !fromWish" type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" data-test="to-wish" @click="convert(app.taskToWish)">Сделать желанием</button>
        <button v-if="app.booksReady" type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" data-test="to-book" @click="convert(app.taskToBook)">Отправить в библиотеку</button>
        <button v-if="app.moviesReady" type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" data-test="to-movie" @click="convert(app.taskToMovie)">Отправить в фильмы</button>
        <button v-if="app.shoppingReady" type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" data-test="to-shopping" @click="convert(app.taskToShopping)">Добавить в список покупок</button>
      </div>
    </div>
  </div>
</template>
