<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'

/** Все теги (самые частые первыми); нажатие открывает все задачи с тегом — откуда угодно: входящие, план, без даты, выполненные */
const app = useApp()
const MAX = 10
const expanded = ref(false)
const shown = computed(() => (expanded.value ? app.allTags : app.allTags.slice(0, MAX)))
</script>

<template>
  <div v-if="app.tagsReady && app.allTags.length" class="mb-3 flex flex-wrap items-center gap-1.5 text-xs" data-test="tag-bar">
    <button v-for="x in shown" :key="x.tag" type="button" class="chip py-0.5 hover:chip-on" :title="'Все задачи с тегом #' + x.tag" data-test="tag-bar-item"
      @click="app.openSearch('#' + x.tag + ' ')">#{{ x.tag }}<span class="ml-1 text-mute">{{ x.count }}</span></button>
    <button v-if="app.allTags.length > MAX" type="button" class="font-semibold text-accent" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ expanded ? 'свернуть' : `ещё ${app.allTags.length - MAX}` }}
    </button>
  </div>
</template>
