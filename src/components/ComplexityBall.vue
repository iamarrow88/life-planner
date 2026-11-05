<script setup lang="ts">
import { computed } from 'vue'
import { COMPLEXITY_LEVELS } from '../lib/dayLoad'

/** Сложность задачи: шарик трёх размеров. Цвет нейтральный: цветной фон занят приоритетом, зелёный и янтарный — временем */
const props = defineProps<{ level: number }>()
const label = computed(() => COMPLEXITY_LEVELS.find(l => l.v === props.level)?.label ?? '')
</script>

<template>
  <span class="inline-block shrink-0 rounded-full bg-current" :class="level === 3 ? 'h-3.5 w-3.5' : level === 2 ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5'" role="img" :aria-label="'Сложность: ' + label.toLowerCase()" :title="'Сложность: ' + label.toLowerCase()" data-test="complexity-ball"></span>
</template>
