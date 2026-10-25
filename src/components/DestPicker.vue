<script setup lang="ts">
import { ref } from 'vue'
import { useApp } from '../stores/app'

/** Выбор места для задачи: сфера (или «Без сферы») → проект (или «Без проекта»). Раскрывается прямо в потоке, без всплывающей подложки */
const props = defineProps<{ exclude?: string }>()
const emit = defineEmits<{ pick: [dest: { sphere_id: string | null; project_id: string | null }] }>()
const app = useApp()
const sphereId = ref<string | null>(null)
const step = ref<'sphere' | 'project'>('sphere')
const projectsFor = (id: string) => app.projectsOf(id).filter(p => p.id !== props.exclude)
function pickSphere(id: string | null) {
  if (id && projectsFor(id).length) { sphereId.value = id; step.value = 'project'; return }
  emit('pick', { sphere_id: id, project_id: null })
}
</script>

<template>
  <div class="rounded-xl bg-bg p-2">
    <div v-if="step === 'sphere'" class="flex flex-col gap-1.5">
      <button v-for="s in app.spheres" :key="s.id" type="button" class="chip w-full justify-start gap-2 py-1.5 text-sm hover:chip-on" @click="pickSphere(s.id)">
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: s.color }"></span>{{ s.name }}
        <span v-if="projectsFor(s.id).length" class="ml-auto text-xs text-mute">проектов: {{ projectsFor(s.id).length }} ›</span>
      </button>
      <button type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" @click="pickSphere(null)">Без сферы</button>
    </div>
    <div v-else class="flex flex-col gap-1.5">
      <div class="flex items-center text-sm">
        <button type="button" class="px-1 text-mute" aria-label="Назад к сферам" @click="step = 'sphere'">‹</button>
        <span class="flex-1 truncate px-2 font-semibold">{{ app.sphereById(sphereId)?.name }}</span>
      </div>
      <button v-for="p in projectsFor(sphereId!)" :key="p.id" type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" @click="emit('pick', { sphere_id: sphereId, project_id: p.id })">{{ p.name }}</button>
      <button type="button" class="chip w-full justify-start py-1.5 text-sm hover:chip-on" @click="emit('pick', { sphere_id: sphereId, project_id: null })">Без проекта</button>
    </div>
  </div>
</template>
