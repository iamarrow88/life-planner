<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import { repo } from '../data'
import { download, habitsCsv, tasksCsv, timeCsv } from '../lib/export'
import { todayStr } from '../lib/time'
import type { ExportData } from '../types'

const app = useApp()
const router = useRouter()
const busy = ref(false)
const done = ref('')

async function run(kind: 'json' | 'tasks' | 'time' | 'habits') {
  busy.value = true; done.value = ''
  const d: ExportData | undefined = await app.exportAll()
  if (d) {
    const day = todayStr()
    if (kind === 'json') download(`planner-${day}.json`, JSON.stringify(d, null, 2), 'application/json')
    else if (kind === 'tasks') download(`planner-tasks-${day}.csv`, tasksCsv(d), 'text/csv')
    else if (kind === 'time') download(`planner-time-${day}.csv`, timeCsv(d), 'text/csv')
    else download(`planner-habits-${day}.csv`, habitsCsv(d), 'text/csv')
    done.value = 'Файл сохранён в папку загрузок.'
  }
  busy.value = false
}
async function logout() { await app.signOut(); router.push('/login') }
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold">Ещё</h1>

  <section class="mb-6">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Экспорт данных</h2>
    <div class="card space-y-3 p-4">
      <div>
        <button class="btn-primary w-full" :disabled="busy" @click="run('json')">Скачать всё · JSON</button>
        <p class="mt-1 text-xs text-mute">Полная копия: сферы, задачи, повторы, привычки, время, цели и итоги недель. Подходит для резервной копии.</p>
      </div>
      <div>
        <div class="mb-1.5 text-sm font-medium">Таблицы · CSV (открываются в Excel и Google Таблицах)</div>
        <div class="grid grid-cols-3 gap-2">
          <button class="btn-ghost" :disabled="busy" @click="run('tasks')">Задачи</button>
          <button class="btn-ghost" :disabled="busy" @click="run('time')">Время</button>
          <button class="btn-ghost" :disabled="busy" @click="run('habits')">Привычки</button>
        </div>
      </div>
      <p v-if="done" class="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{{ done }}</p>
    </div>
  </section>

  <section>
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Аккаунт</h2>
    <div class="card space-y-2 p-4 text-sm">
      <div class="text-mute">{{ app.user?.email }}</div>
      <p v-if="repo.mode === 'demo'" class="text-xs text-amber-800">Демо-режим: данные хранятся только в этом браузере.</p>
      <button v-else class="btn-ghost" @click="logout">Выйти</button>
    </div>
  </section>
</template>
