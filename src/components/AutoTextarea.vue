<script setup lang="ts">
// Поле, которое растёт по мере ввода: виден весь текст, ничего не прокручивается.
// Для названий задач: Enter отправляет форму (перенос строки запрещён, вставленный текст склеивается в одну строку).
import { nextTick, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string; placeholder?: string; singleLine?: boolean; minRows?: number; maxlength?: number; required?: boolean; autofocus?: boolean
}>(), { placeholder: '', singleLine: false, minRows: 1, maxlength: undefined })
const emit = defineEmits<{ 'update:modelValue': [v: string]; submit: [] }>()
const el = ref<HTMLTextAreaElement | null>(null)

function fit() {
  const t = el.value
  if (!t) return
  t.style.height = 'auto'
  t.style.height = t.scrollHeight + 2 + 'px' // +2 — рамка поля
}
function onInput(e: Event) {
  const t = e.target as HTMLTextAreaElement
  if (props.singleLine && /[\r\n]/.test(t.value)) t.value = t.value.replace(/\s*[\r\n]+\s*/g, ' ')
  emit('update:modelValue', t.value)
  fit()
}
function onEnter(e: KeyboardEvent) {
  if (!props.singleLine || e.isComposing) return
  e.preventDefault()
  emit('submit')
}
watch(() => props.modelValue, () => nextTick(fit))
onMounted(() => { fit(); if (props.autofocus) el.value?.focus() })
// ширина поля меняется (поворот экрана, окно) — высоту пересчитываем
onMounted(() => { if ('ResizeObserver' in window && el.value) new ResizeObserver(fit).observe(el.value) })
</script>

<template>
  <textarea ref="el" class="input block shrink-0 resize-none overflow-hidden" :rows="minRows" :value="modelValue" :placeholder="placeholder"
    :maxlength="maxlength" :required="required" @input="onInput" @keydown.enter="onEnter" />
</template>
