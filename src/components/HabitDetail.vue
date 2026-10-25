<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { HabitKind } from '../types'

const app = useApp()
const habit = computed(() => app.data.habits.find(h => h.id === app.habitDetailId) ?? null)
const name = ref('')
const kind = ref<HabitKind>('plain')
const target = ref(1)
const sphereId = ref('')
const busy = ref(false)
const kinds: { v: HabitKind; label: string }[] = [
  { v: 'timer', label: 'Таймер' }, { v: 'plain', label: 'Без таймера' }, { v: 'counter', label: 'Счётчик' },
]

watch(habit, h => {
  if (!h) return
  name.value = h.name; kind.value = h.kind; target.value = h.target_value ?? (h.kind === 'timer' ? 20 : 8); sphereId.value = h.sphere_id
}, { immediate: true })

function pickKind(k: HabitKind) {
  if (k === kind.value) return
  kind.value = k
  target.value = k === 'timer' ? 20 : k === 'counter' ? 8 : 1
}

async function save() {
  const h = habit.value; if (!h || !name.value.trim() || !sphereId.value) return
  busy.value = true
  const ok = await app.updateHabit(h.id, {
    name: name.value.trim(), kind: kind.value, sphere_id: sphereId.value,
    target_value: kind.value === 'plain' ? null : Math.max(1, Math.floor(target.value || 1)),
  })
  busy.value = false
  if (ok) app.closeHabit()
}
async function remove() {
  const h = habit.value
  if (h && confirm('Удалить привычку? Она пропадёт из списков, а накопленная история останется в базе.')) { await app.removeHabit(h.id); app.closeHabit() }
}
</script>

<template>
  <div v-if="habit" class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" @click.self="app.closeHabit()">
    <form class="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-bg p-5 md:rounded-3xl" @submit.prevent="save">
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-lg font-bold">Привычка</h2>
        <button type="button" class="text-2xl leading-none text-mute" aria-label="Закрыть" @click="app.closeHabit()">×</button>
      </div>

      <input v-model="name" class="input" maxlength="120" required placeholder="Название привычки" aria-label="Название привычки" />

      <div class="flex gap-2">
        <button v-for="k in kinds" :key="k.v" type="button" class="chip flex-1 justify-center py-2" :class="kind === k.v && 'chip-on'" @click="pickKind(k.v)">{{ k.label }}</button>
      </div>
      <label v-if="kind !== 'plain'" class="flex items-center gap-3 text-sm text-mute">
        {{ kind === 'timer' ? 'Минут в день' : 'Раз в день' }}
        <input v-model.number="target" type="number" min="1" class="input !w-24" />
      </label>

      <label class="text-xs text-mute">Сфера
        <select v-model="sphereId" class="input mt-1" required><option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option></select>
      </label>

      <div class="flex gap-2">
        <button class="btn-primary flex-1" :disabled="busy || !name.trim() || !sphereId">Сохранить</button>
        <button type="button" class="btn-ghost !text-red-700" @click="remove">Удалить</button>
      </div>
    </form>
  </div>
</template>
