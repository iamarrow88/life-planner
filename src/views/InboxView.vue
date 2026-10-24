<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { addDays } from '../lib/time'
import TaskRow from '../components/TaskRow.vue'
import EstimateInput from '../components/EstimateInput.vue'
import DoneBlock from '../components/DoneBlock.vue'

const app = useApp()
const text = ref('')
const estimate = ref<number | null>(null)
const picking = ref<string | null>(null) // id задачи, у которой открыт выбор даты

async function add() {
  const title = text.value.trim()
  if (!title) return
  const est = estimate.value
  text.value = ''; estimate.value = null
  await app.addTask({ title, status: 'inbox', estimate_minutes: est })
}
/** Выполненные задачи «из входящих»: те, которые так и не получили дату */
const doneUndated = computed(() => app.data.tasks.filter(t => t.status === 'done' && !t.due_date))
const plan = (id: string, date: string) => { picking.value = null; return app.updateTask(id, { status: 'planned', due_date: date }) }
const setSphere = (id: string, v: string) => app.updateTask(id, { sphere_id: v || null })
</script>

<template>
  <h1 class="mb-1 text-2xl font-bold">Входящие</h1>
  <p class="mb-4 text-sm text-mute">Всё, что не хочется держать в голове. Разберёшь потом.</p>

  <form class="mb-5 flex flex-wrap gap-2" @submit.prevent="add">
    <input v-model="text" class="input !w-auto min-w-[12rem] flex-1" placeholder="Что нужно запомнить?" autofocus />
    <EstimateInput v-model="estimate" />
    <button class="btn-primary shrink-0" :disabled="!text.trim()">Добавить</button>
  </form>

  <div v-if="!app.inbox.length && !app.loading" class="card p-8 text-center text-mute">
    Пусто — отличное состояние ✨
  </div>
  <ul v-else class="space-y-3">
    <li v-for="t in app.inbox" :key="t.id" class="card">
      <TaskRow :task="t" />
      <div class="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <button class="chip hover:chip-on" @click="plan(t.id, app.today)">Сегодня</button>
        <button class="chip hover:chip-on" @click="plan(t.id, addDays(app.today, 1))">Завтра</button>
        <label class="chip hover:chip-on relative cursor-pointer">
          {{ picking === t.id ? 'Выбери дату' : 'Дата…' }}
          <input type="date" class="absolute inset-0 cursor-pointer opacity-0" :min="app.today"
            @change="e => (e.target as HTMLInputElement).value && plan(t.id, (e.target as HTMLInputElement).value)" />
        </label>
        <select class="chip bg-white pr-6" :value="t.sphere_id ?? ''" @change="e => setSphere(t.id, (e.target as HTMLSelectElement).value)">
          <option value="">Без сферы</option>
          <option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <button class="ml-auto text-xs text-mute hover:text-red-600" @click="app.removeTask(t.id)">Удалить</button>
      </div>
    </li>
  </ul>

  <DoneBlock :tasks="doneUndated" />
</template>
