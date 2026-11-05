<script setup lang="ts">
import { computed } from 'vue'
import { useApp } from '../stores/app'

/** Строка «День перегружен»: видна только при превышении лимитов и не зависит от отборов на экране */
const props = defineProps<{ day: string }>()
const app = useApp()
const text = computed(() => app.overloadOn(props.day).map(o => `${o.many} ${o.count} из ${o.limit}`).join(', '))
</script>

<template>
  <p v-if="text" class="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status" data-test="day-overload">День перегружен: {{ text }}</p>
</template>
