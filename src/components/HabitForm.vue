<script setup lang="ts">
import { ref } from 'vue'
import { useApp } from '../stores/app'
import type { HabitKind } from '../types'

const emit = defineEmits<{ done: [] }>()
const app = useApp()
const name = ref('')
const kind = ref<HabitKind>('plain')
const target = ref(8)
const sphereId = ref(app.spheres[0]?.id ?? '')
const kinds: { v: HabitKind; label: string }[] = [
  { v: 'timer', label: 'Таймер' }, { v: 'plain', label: 'Без таймера' }, { v: 'counter', label: 'Счётчик' },
]

async function save() {
  if (!name.value.trim() || !sphereId.value) return
  await app.addHabit({
    name: name.value.trim(), kind: kind.value, sphere_id: sphereId.value,
    target_value: kind.value === 'plain' ? null : Math.max(1, Math.floor(target.value || 1)),
  })
  emit('done')
}
</script>

<template>
  <form class="card space-y-3 p-4" @submit.prevent="save">
    <input v-model="name" class="input" placeholder="Название привычки" required autofocus />
    <div class="flex gap-2">
      <button v-for="k in kinds" :key="k.v" type="button" class="chip flex-1 justify-center py-2" :class="kind === k.v && 'chip-on'" @click="kind = k.v">{{ k.label }}</button>
    </div>
    <label v-if="kind !== 'plain'" class="flex items-center gap-3 text-sm text-mute">
      {{ kind === 'timer' ? 'Минут в день' : 'Раз в день' }}
      <input v-model.number="target" type="number" min="1" class="input !w-24" />
    </label>
    <select v-model="sphereId" class="input" required>
      <option v-if="!app.spheres.length" value="" disabled>Сначала создай сферу</option>
      <option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
    <div class="flex gap-2">
      <button class="btn-primary flex-1" :disabled="!sphereId">Сохранить</button>
      <button type="button" class="btn-ghost" @click="emit('done')">Отмена</button>
    </div>
  </form>
</template>
