<script setup lang="ts">
import { ref } from 'vue'
import { useApp } from '../stores/app'
import type { NewTask } from '../types'
import AutoTextarea from './AutoTextarea.vue'
import EstimateInput from './EstimateInput.vue'
import ComplexityPicker from './ComplexityPicker.vue'

/** Новая задача на выбранный день в календаре. newTaskFields — отбор экрана: новая задача получает то, что в нём выбрано */
const props = defineProps<{ day: string; newTaskFields?: () => Partial<NewTask> }>()
const app = useApp()
const text = ref('')
const estimate = ref<number | null>(null)
const complexity = ref<number | null>(null)
async function add() {
  const title = text.value.trim(); if (!title) return
  const est = estimate.value, level = complexity.value
  text.value = ''; estimate.value = null; complexity.value = null
  await app.addTask({ title, status: 'planned', due_date: props.day, estimate_minutes: est, complexity: level, ...props.newTaskFields?.() })
}
</script>

<template>
  <form class="mb-3 flex flex-wrap items-start gap-2" data-test="day-add" @submit.prevent="add">
    <AutoTextarea v-model="text" single-line :maxlength="500" class="!w-auto min-w-[10rem] flex-1" placeholder="Новое дело на этот день…" @submit="add" />
    <EstimateInput v-model="estimate" />
    <ComplexityPicker v-model="complexity" />
    <button class="btn-soft shrink-0" :disabled="!text.trim()" aria-label="Добавить задачу">+</button>
  </form>
</template>
