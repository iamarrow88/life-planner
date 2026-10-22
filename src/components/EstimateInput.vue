<script setup lang="ts">
/** Необязательное поле «сколько времени займёт» в минутах. Пусто = не задано. */
const model = defineModel<number | null>({ default: null })
const presets = [15, 30, 45, 60, 90, 120]
function onInput(e: Event) {
  const v = Math.floor(Number((e.target as HTMLInputElement).value))
  model.value = v > 0 ? v : null
}
</script>

<template>
  <input class="input !w-28 shrink-0" type="number" min="1" inputmode="numeric" list="estimate-presets"
    placeholder="≈ минут" title="Примерное время (необязательно)" :value="model ?? ''" @input="onInput" />
  <datalist id="estimate-presets"><option v-for="p in presets" :key="p" :value="p" /></datalist>
</template>
