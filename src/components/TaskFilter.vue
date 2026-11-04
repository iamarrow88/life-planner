<script setup lang="ts">
import { computed, watch } from 'vue'
import { useApp } from '../stores/app'
import { EMPTY_FILTER, NONE, type TaskFilter } from '../lib/taskFilter'

/** Отбор задач по сфере, проекту и тегу (экраны «Входящие» и «Сегодня»); новые задачи получают выбранное */
const model = defineModel<TaskFilter>({ required: true })
const app = useApp()
const sphere = computed(() => (model.value.sphere && model.value.sphere !== NONE ? app.sphereById(model.value.sphere) : null))
const projects = computed(() => (sphere.value ? app.projectsOf(sphere.value.id) : []))
// сфера, проект или тег пропали (в архиве, удалены, стали проектом) — снимаем их из отбора, иначе список был бы пустым без причины
watch(() => [model.value, app.spheres.length, app.data.projects.length, app.allTags.length], () => {
  const { sphere: s, project: p, tag: t } = model.value
  const noSphere = !!s && s !== NONE && !app.sphereById(s)
  const noProject = !!p && p !== NONE && !app.projectsOf(s).some(x => x.id === p)
  const noTag = !!t && app.tagsReady && !app.allTags.some(x => x.tag === t)
  if (noSphere || noProject || noTag) model.value = { sphere: noSphere ? '' : s, project: noSphere || noProject ? '' : p, tag: noTag ? '' : t }
}, { immediate: true })
const active = computed(() => !!model.value.sphere || !!model.value.tag)
function setSphere(e: Event) { model.value = { ...model.value, sphere: (e.target as HTMLSelectElement).value, project: '' } }
function setTag(e: Event) { model.value = { ...model.value, tag: (e.target as HTMLSelectElement).value } }
function setProject(e: Event) { model.value = { ...model.value, project: (e.target as HTMLSelectElement).value } }
</script>

<template>
  <div class="mb-3 flex flex-wrap items-center gap-2 text-sm" data-test="task-filter">
    <span v-if="sphere" class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: sphere.color }"></span>
    <select :value="model.sphere" class="input min-w-0 !w-auto max-w-[10.5rem] !py-1.5 !pl-2.5 !pr-8 !text-sm" :class="model.sphere && '!border-accent'" aria-label="Отбор по сфере" data-test="filter-sphere" @change="setSphere">
      <option value="">Все сферы</option>
      <option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option>
      <option :value="NONE">Без сферы</option>
    </select>
    <select v-if="projects.length" :value="model.project" class="input min-w-0 !w-auto max-w-[10.5rem] !py-1.5 !pl-2.5 !pr-8 !text-sm" :class="model.project && '!border-accent'" aria-label="Отбор по проекту" data-test="filter-project" @change="setProject">
      <option value="">Все проекты</option>
      <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
      <option :value="NONE">Без проекта</option>
    </select>
    <select v-if="app.tagsReady && (app.allTags.length || model.tag)" :value="model.tag" class="input min-w-0 !w-auto max-w-[10.5rem] !py-1.5 !pl-2.5 !pr-8 !text-sm" :class="model.tag && '!border-accent'" aria-label="Отбор по тегу" data-test="filter-tag" @change="setTag">
      <option value="">Все теги</option>
      <option v-for="x in app.allTags" :key="x.tag" :value="x.tag">#{{ x.tag }}</option>
    </select>
    <button v-if="active" type="button" class="shrink-0 px-1 text-lg leading-none text-mute hover:text-accent" aria-label="Сбросить отбор" title="Показать все задачи" data-test="filter-reset" @click="model = { ...EMPTY_FILTER }">×</button>
  </div>
</template>
