<script setup lang="ts">
import { useApp } from '../stores/app'
import { COMPLEXITY_LEVELS } from '../lib/dayLoad'
import ComplexityBall from './ComplexityBall.vue'

/** Выбор сложности: повторное нажатие снимает выбор. labels — с подписями (карточка), без них — только шарики (форма добавления) */
const model = defineModel<number | null>({ default: null })
defineProps<{ labels?: boolean }>()
const app = useApp()
</script>

<template>
  <div v-if="app.complexityReady" class="flex items-center gap-1" role="group" aria-label="Сложность" data-test="complexity-picker">
    <button v-for="l in COMPLEXITY_LEVELS" :key="l.v" type="button" class="flex items-center justify-center gap-1.5 rounded-xl border transition"
      :class="[labels ? 'px-2.5 py-1.5 text-xs font-medium' : 'h-[42px] w-9', model === l.v ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-white/70 text-mute hover:border-accent']"
      :aria-pressed="model === l.v" :aria-label="'Сложность: ' + l.label.toLowerCase()" :title="l.label" :data-level="l.v" @click="model = model === l.v ? null : l.v">
      <ComplexityBall :level="l.v" aria-hidden="true" title="" />
      <template v-if="labels">{{ l.label }}</template>
    </button>
  </div>
</template>
