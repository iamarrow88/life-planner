<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { diagnostics, exactAlarmsOn, notifyState, openExactAlarmSettings, requestNotify, testNotification, type NativeNotifyState, type NotifyDiagnostics } from '../lib/nativeReminders'
import { resyncReminders } from '../lib/native'

/** «Уведомления» в приложении для телефона: системные напоминания вместо web-push */
const state = ref<NativeNotifyState | 'loading'>('loading')
const exact = ref(true)
const msg = ref('')
const diag = ref<NotifyDiagnostics | null>(null)
async function refresh() {
  state.value = await notifyState().catch(() => 'prompt' as const)
  exact.value = await exactAlarmsOn()
  diag.value = await diagnostics().catch(() => null)
}
async function enable() {
  msg.value = ''
  state.value = await requestNotify()
  if (state.value === 'granted') {
    msg.value = 'Уведомления включены. Напоминания поставлены на 14 дней вперёд.'
    resyncReminders()
  }
}
async function fixExact() { exact.value = await openExactAlarmSettings() }
async function test(delay = 0) {
  msg.value = ''
  try {
    await testNotification(delay)
    msg.value = delay
      ? 'Сверни приложение: через 10 секунд придёт уведомление. Если оно не пришло или пришло позже — телефон откладывает напоминания (см. подсказку ниже).'
      : 'Уведомление отправлено — посмотри в шторке (потяни сверху вниз). Если его нет — см. подсказку ниже.'
  } catch (e) { msg.value = (e as Error).message }
  diag.value = await diagnostics().catch(() => null)
}
let onResume: PluginListenerHandle | null = null
onMounted(async () => {
  void refresh()
  // вернулась из настроек Android — проверить, что изменилось
  onResume = await App.addListener('resume', refresh)
})
onUnmounted(() => { void onResume?.remove() })
</script>

<template>
  <div class="card space-y-3 p-4 text-sm" data-test="native-notifications">
    <p class="text-mute">Напоминания ставятся в сам телефон и приходят даже без интернета: задачи со временем (за выбранное время до начала), таблетки и другие привычки со временем, таймер (раз в 40 минут) и итог недели в воскресенье в 19:00. Расписание обновляется каждый раз, когда ты открываешь приложение или что-то меняешь.</p>
    <p v-if="state === 'loading'" class="text-mute">Проверяю…</p>
    <p v-else-if="state === 'denied'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Уведомления для KolaApp запрещены. Разреши их в настройках Android: Настройки → Приложения → KolaApp → Уведомления.</p>
    <template v-else-if="state === 'granted'">
      <p class="rounded-lg bg-accent-soft px-3 py-2 font-medium text-accent">✓ Уведомления включены</p>
      <div v-if="!exact" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
        Android может присылать напоминания с опозданием на несколько минут. Чтобы они приходили точно вовремя, разреши KolaApp «Будильники и напоминания».
        <button class="btn-ghost mt-2 w-full" @click="fixExact">Открыть настройку</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button class="btn-ghost" data-test="notify-test" @click="test(0)">Проверить сейчас</button>
        <button class="btn-ghost" data-test="notify-test-later" @click="test(10)">Через 10 секунд</button>
      </div>
    </template>
    <button v-else class="btn-primary w-full" @click="enable">Включить уведомления</button>
    <p v-if="msg" class="text-xs text-mute">{{ msg }}</p>
    <!-- Если уведомление не пришло: что видно приложению и что проверить в телефоне -->
    <details v-if="state === 'granted'" class="text-xs text-mute">
      <summary class="cursor-pointer font-medium">Уведомление не пришло?</summary>
      <p v-if="diag" class="mt-1" data-test="notify-diag">Разрешение: {{ diag.permission === 'granted' ? 'есть' : 'нет' }} · точное время: {{ diag.exact ? 'да' : 'нет' }} · канал «Напоминания»: {{ diag.channel === 'ok' ? 'включён' : diag.channel === 'muted' ? 'без звука или выключен' : 'ещё не создан' }} · запланировано: {{ diag.pending }}</p>
      <ul class="mt-1 list-disc space-y-0.5 pl-4">
        <li>Настройки → Приложения → KolaApp → Уведомления: всё включено, у категории «Напоминания» — звук и всплывающие уведомления.</li>
        <li>Выключи режим «Не беспокоить».</li>
        <li>Батарея: для KolaApp выбери «Без ограничений» (на Xiaomi ещё включи «Автозапуск»), иначе телефон может откладывать напоминания.</li>
      </ul>
    </details>
  </div>
</template>
