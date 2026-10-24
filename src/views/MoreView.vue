<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import { repo } from '../data'
import { download, habitsCsv, tasksCsv, timeCsv } from '../lib/export'
import { todayStr } from '../lib/time'
import type { ExportData } from '../types'
import { googleClientId, googleRedirectUri, startGoogleLogin, takeGoogleCallback } from '../lib/google'
import { getPushState, showTestNotification, subscribePush, unsubscribePush, type PushState } from '../lib/push'

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
// ---- Уведомления
const push = ref<PushState | 'loading'>('loading')
const pushBusy = ref(false)
const pushMsg = ref('')
async function refreshPush() {
  push.value = repo.mode === 'demo' ? 'off' : await getPushState().catch(() => 'unsupported' as PushState)
}
async function enablePush() {
  pushBusy.value = true; pushMsg.value = ''
  try {
    const sub = await subscribePush()
    if (await app.savePush(sub)) pushMsg.value = 'Уведомления включены на этом устройстве.'
  } catch (e) { pushMsg.value = (e as Error).message }
  await refreshPush(); pushBusy.value = false
}
async function disablePush() {
  pushBusy.value = true; pushMsg.value = ''
  try {
    const endpoint = await unsubscribePush()
    if (endpoint) await app.removePush(endpoint)
    pushMsg.value = 'Уведомления выключены на этом устройстве.'
  } catch (e) { pushMsg.value = (e as Error).message }
  await refreshPush(); pushBusy.value = false
}
async function testPush() {
  pushMsg.value = ''
  try { await showTestNotification(); pushMsg.value = 'Тестовое уведомление отправлено на это устройство.' } catch (e) { pushMsg.value = (e as Error).message }
}
onMounted(refreshPush)

// ---- Google Календарь
const gMsg = ref('')
const gWorking = ref(false)
const g = computed(() => app.google)
const gStatus = computed<'demo' | 'no-id' | 'loading' | 'not-deployed' | 'ready'>(() => {
  if (repo.mode === 'demo') return 'demo'
  if (!googleClientId) return 'no-id'
  if (!g.value) return app.googleError ? 'not-deployed' : 'loading'
  return 'ready'
})
function when(iso: string | null): string {
  if (!iso) return 'ещё не было'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} ч назад` : new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
async function connectGoogleNow() { gMsg.value = ''; startGoogleLogin() }
async function syncNow() {
  gMsg.value = ''; gWorking.value = true
  await app.syncGoogle(true)
  const r = app.google?.report
  if (!app.googleError && r && 'changed' in r) gMsg.value = r.pushed + r.pulled + r.imported + r.deleted + r.unlinked === 0 ? 'Всё уже синхронизировано.' : `Готово: отправлено ${r.pushed}, получено изменений ${r.pulled}, новых задач ${r.imported}.`
  gWorking.value = false
}
async function disconnectNow() {
  if (!window.confirm('Отключить Google Календарь? Задачи и события останутся на месте, но перестанут обновляться друг у друга.')) return
  gMsg.value = ''; await app.disconnectGoogle()
}
onMounted(async () => {
  const cb = takeGoogleCallback()
  if (cb) {
    gWorking.value = true
    if ('error' in cb) app.googleError = cb.error
    else {
      await app.connectGoogle(cb.code, googleRedirectUri())
      const r = app.google?.report
      if (!app.googleError && r && 'imported' in r) gMsg.value = `Подключено. В Google отправлено задач: ${r.pushed}, из Google получено событий: ${r.imported}.`
    }
    gWorking.value = false
  } else await app.refreshGoogle()
})

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

  <section class="mb-6">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Уведомления</h2>
    <div class="card space-y-3 p-4 text-sm">
      <p class="text-mute">Это устройство получит: напоминания о задачах со временем (за выбранное время до начала), напоминание, пока идёт таймер (раз в 40 минут), и итог недели в воскресенье.</p>
      <p v-if="repo.mode === 'demo'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Уведомления доступны после подключения Supabase (демо-режим их не поддерживает).</p>
      <p v-else-if="push === 'loading'" class="text-mute">Проверяю…</p>
      <p v-else-if="push === 'unsupported'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Этот браузер не поддерживает push-уведомления.</p>
      <p v-else-if="push === 'ios-install'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">На iPhone и iPad уведомления работают только у приложения на экране «Домой»: в Safari нажми «Поделиться» → «На экран Домой», открой приложение оттуда и вернись сюда.</p>
      <p v-else-if="push === 'no-key'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Не задан ключ <code>VITE_VAPID_PUBLIC_KEY</code> в <code>.env</code>. Как его получить — в файле PUSH.md.</p>
      <p v-else-if="push === 'denied'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Уведомления запрещены в настройках браузера для этого сайта. Разреши их там (значок замка рядом с адресом) и обнови страницу.</p>
      <template v-else-if="push === 'on'">
        <p class="rounded-lg bg-accent-soft px-3 py-2 font-medium text-accent">✓ Включены на этом устройстве</p>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn-ghost" @click="testPush">Проверить</button>
          <button class="btn-ghost" :disabled="pushBusy" @click="disablePush">Выключить</button>
        </div>
      </template>
      <button v-else class="btn-primary w-full" :disabled="pushBusy" @click="enablePush">Включить уведомления</button>
      <p v-if="pushMsg" class="text-xs text-mute">{{ pushMsg }}</p>
    </div>
  </section>

  <section class="mb-6">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Google Календарь</h2>
    <div class="card space-y-3 p-4 text-sm">
      <p class="text-mute">Задачи со временем появляются в твоём Google Календаре, а события из Google — в My life planner. Изменения идут в обе стороны.</p>
      <p v-if="gStatus === 'demo'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Синхронизация доступна после подключения Supabase (демо-режим её не поддерживает).</p>
      <p v-else-if="gStatus === 'no-id'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Не задан <code>VITE_GOOGLE_CLIENT_ID</code> в <code>.env</code>. Как его получить — в файле GOOGLE.md.</p>
      <p v-else-if="gStatus === 'loading'" class="text-mute">Проверяю…</p>
      <p v-else-if="gStatus === 'not-deployed'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{{ app.googleError }}</p>
      <template v-else-if="g">
        <template v-if="g.connected">
          <p class="rounded-lg bg-accent-soft px-3 py-2 font-medium text-accent">✓ Подключено<span v-if="g.email">: {{ g.email }}</span></p>
          <p class="text-xs text-mute">Последняя синхронизация: {{ when(g.last_sync_at) }}. Приложение само обновляет календарь после правок и каждые 5 минут.</p>
          <label class="flex items-start gap-2">
            <input type="checkbox" class="mt-1" :checked="g.import_events" @change="app.setGoogleImport(($event.target as HTMLInputElement).checked)" />
            <span>Создавать задачи из событий Google<span class="block text-xs text-mute">Берутся события на ближайшие 90 дней. Если удалить такую задачу, событие в Google останется.</span></span>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button class="btn-ghost" :disabled="app.googleBusy || gWorking" @click="syncNow">{{ app.googleBusy ? 'Синхронизирую…' : 'Синхронизировать' }}</button>
            <button class="btn-ghost" :disabled="app.googleBusy" @click="disconnectNow">Отключить</button>
          </div>
        </template>
        <template v-else>
          <p v-if="!g.configured" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">На сервере не заданы ключи Google. Выполни шаг 3 из GOOGLE.md.</p>
          <button class="btn-primary w-full" :disabled="app.googleBusy || gWorking" @click="connectGoogleNow">{{ app.googleBusy || gWorking ? 'Подключаю…' : 'Подключить Google Календарь' }}</button>
        </template>
      </template>
      <p v-if="app.googleError && gStatus !== 'not-deployed'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{{ app.googleError }}</p>
      <p v-else-if="g?.connected && g.last_error" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{{ g.last_error }}</p>
      <p v-if="gMsg" class="text-xs text-mute">{{ gMsg }}</p>
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
