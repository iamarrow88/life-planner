<script setup lang="ts">
import { ref, watch } from 'vue'
import { useApp } from '../stores/app'
import AutoTextarea from './AutoTextarea.vue'
import type { RecurrenceFreq, RecurrenceMode } from '../types'

/** sphereId — сфера, выбранная заранее (форма открыта из карточки сферы) */
const props = defineProps<{ sphereId?: string }>()
const emit = defineEmits<{ done: [] }>()
const app = useApp()
const title = ref('')
const freq = ref<RecurrenceFreq>('week')
const interval = ref(1)
const weekdays = ref<number[]>([1, 3, 5])
const mode = ref<RecurrenceMode>('schedule')
const time = ref('')
const remind = ref('')
const remindTouched = ref(false)
watch(time, (now, before) => { if (now && !before && !remindTouched.value) remind.value = '10' })
const estimate = ref<number | null>(null)
const sphereId = ref(props.sphereId ?? '')
const startsOn = ref(app.today)
const busy = ref(false)

const freqs: { v: RecurrenceFreq; label: string }[] = [
  { v: 'day', label: 'День' }, { v: 'week', label: 'Неделя' }, { v: 'month', label: 'Месяц' }, { v: 'year', label: 'Год' },
]
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const toggleDay = (i: number) => {
  weekdays.value = weekdays.value.includes(i) ? weekdays.value.filter(x => x !== i) : [...weekdays.value, i]
}
const needDays = () => freq.value === 'week' && mode.value === 'schedule'

async function save() {
  if (!title.value.trim() || (needDays() && !weekdays.value.length)) return
  busy.value = true
  const ok = await app.addRecurrence({
    title: title.value.trim(), sphere_id: sphereId.value || null,
    start_time: time.value ? `${time.value}:00` : null,
    estimate_minutes: estimate.value && estimate.value > 0 ? Math.floor(estimate.value) : null,
    remind_before_minutes: time.value && remind.value !== '' ? Number(remind.value) : null,
    freq: freq.value, interval_n: Math.max(1, Math.floor(interval.value || 1)),
    weekdays: freq.value === 'week' && mode.value === 'schedule' ? [...weekdays.value].sort() : null,
    mode: mode.value, starts_on: startsOn.value,
  })
  busy.value = false
  if (ok) emit('done')
}
</script>

<template>
  <form class="card space-y-3 p-4" @submit.prevent="save">
    <AutoTextarea v-model="title" single-line :maxlength="500" required autofocus placeholder="Что повторяется? Например, «Уборка»" @submit="save" />

    <div>
      <div class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mute">Как часто</div>
      <div class="flex items-center gap-2">
        <span class="text-sm text-mute">Каждые</span>
        <input v-model.number="interval" type="number" min="1" max="366" class="input !w-20" />
        <div class="flex flex-1 gap-1.5">
          <button v-for="f in freqs" :key="f.v" type="button" class="chip flex-1 justify-center py-2" :class="freq === f.v && 'chip-on'" @click="freq = f.v">{{ f.label }}</button>
        </div>
      </div>
    </div>

    <div v-if="needDays()" class="flex gap-1.5">
      <button v-for="(d, i) in WD" :key="d" type="button" class="chip flex-1 justify-center py-2"
        :class="weekdays.includes(i + 1) && 'chip-on'" @click="toggleDay(i + 1)">{{ d }}</button>
    </div>

    <div class="flex gap-2">
      <button type="button" class="chip flex-1 justify-center py-2" :class="mode === 'schedule' && 'chip-on'" @click="mode = 'schedule'">По расписанию</button>
      <button type="button" class="chip flex-1 justify-center py-2" :class="mode === 'after_completion' && 'chip-on'" @click="mode = 'after_completion'">После выполнения</button>
    </div>
    <p class="text-xs text-mute">
      {{ mode === 'schedule' ? 'Задачи появляются по календарю, даже если прошлая не сделана.' : 'Следующая задача появится только после того, как отметишь текущую выполненной.' }}
    </p>

    <div class="grid grid-cols-2 gap-2">
      <label class="text-xs text-mute">Начиная с<input v-model="startsOn" type="date" class="input mt-1" required /></label>
      <label class="text-xs text-mute">Время (необязательно)<input v-model="time" type="time" class="input mt-1" /></label>
      <label class="col-span-2 text-xs text-mute">Напоминание
        <select v-model="remind" class="input mt-1" :disabled="!time" @change="remindTouched = true">
          <option value="">Не напоминать</option><option value="0">В момент начала</option><option value="5">За 5 минут</option>
          <option value="10">За 10 минут</option><option value="15">За 15 минут</option><option value="30">За 30 минут</option><option value="60">За 1 час</option>
        </select>
      </label>
      <label class="text-xs text-mute">План, минут<input v-model.number="estimate" type="number" min="1" class="input mt-1" /></label>
      <label class="text-xs text-mute">Сфера
        <select v-model="sphereId" class="input mt-1"><option value="">Без сферы</option><option v-for="s in app.spheres" :key="s.id" :value="s.id">{{ s.name }}</option></select>
      </label>
    </div>

    <div class="flex gap-2">
      <button class="btn-primary flex-1" :disabled="busy">Сохранить</button>
      <button type="button" class="btn-ghost" @click="emit('done')">Отмена</button>
    </div>
  </form>
</template>
