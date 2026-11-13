<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import { repo } from '../data'
import { download, habitsCsv, tasksCsv, timeCsv } from '../lib/export'
import { todayStr } from '../lib/time'
import type { ExportData } from '../types'
import { normTag } from '../lib/tags'
import { captureUrl } from '../data/supabase'
import type { CaptureInfo } from '../types'
import { googleClientId, googleRedirectUri, startGoogleLogin, takeGoogleCallback } from '../lib/google'
import { getPushState, showTestNotification, subscribePush, unsubscribePush, type PushState } from '../lib/push'
import { isNative } from '../lib/native'
import NativeNotifications from '../components/NativeNotifications.vue'
import RestoreData from '../components/RestoreData.vue'
import { DEFAULT_SPHERE_COLORS, MAX_SPHERE_COLORS, parseColors } from '../lib/colors'
import { MODULES } from '../lib/modules'

const app = useApp()
const router = useRouter()
const busy = ref(false)
const done = ref('')
const withCycle = ref(false)

async function run(kind: 'json' | 'tasks' | 'time' | 'habits') {
  busy.value = true; done.value = ''
  // данные цикла — только по галочке
  const d: ExportData | undefined = await app.exportAll(withCycle.value)
  if (d) {
    const day = todayStr()
    const saved = await (kind === 'json' ? download(`planner-${day}.json`, JSON.stringify(d, null, 2), 'application/json')
      : kind === 'tasks' ? download(`planner-tasks-${day}.csv`, tasksCsv(d), 'text/csv')
      : kind === 'time' ? download(`planner-time-${day}.csv`, timeCsv(d), 'text/csv')
      : download(`planner-habits-${day}.csv`, habitsCsv(d), 'text/csv'))
    done.value = !saved ? 'Файл не сохранён.' : isNative ? 'Файл передан в выбранное приложение.' : 'Файл сохранён в папку загрузок.'
  }
  busy.value = false
}
// ---- Теги: переименовать (с существующим — слить), удалить
const tagMsg = ref('')
async function renameTag(tag: string) {
  const to = window.prompt(`Новое название тега #${tag}. Если такой тег уже есть, теги сольются в один.`, tag)
  if (to === null || normTag(to) === tag) return
  const target = normTag(to)
  const merge = app.allTags.some(x => x.tag === target)
  if (merge && !confirm(`Тег #${target} уже есть. Слить #${tag} с #${target}?`)) return
  tagMsg.value = ''
  if (await app.renameTag(tag, to)) tagMsg.value = merge ? `#${tag} слит с #${target}.` : `#${tag} → #${target}`
}
async function removeTag(tag: string, count: number) {
  if (!confirm(`Удалить тег #${tag}? Он пропадёт у ${count} задач, сами задачи останутся.`)) return
  tagMsg.value = ''
  if (await app.renameTag(tag, null)) tagMsg.value = `Тег #${tag} удалён.`
}

// ---- Бюджет времени: сон и текучка (часов в день) — это время не делится между сферами
const sleepH = ref(app.timeBudget.sleep_minutes_per_day / 60)
const routineH = ref(app.timeBudget.routine_minutes_per_day / 60)
const budgetMsg = ref('')
const toMin = (h: number) => Math.min(1440, Math.max(0, Math.round((h || 0) * 60)))
async function saveBudget() {
  budgetMsg.value = ''
  if (await app.saveTimeBudget({ sleep_minutes_per_day: toMin(sleepH.value), routine_minutes_per_day: toMin(routineH.value) })) budgetMsg.value = 'Сохранено.'
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
onMounted(() => { if (!isNative) void refreshPush() })

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
  if (!app.googleError && r && 'changed' in r) gMsg.value = r.pushed + r.pulled + r.imported + r.deleted + r.unlinked + (r.removed ?? 0) === 0 ? 'Всё уже синхронизировано.' : `Готово: отправлено ${r.pushed}, получено изменений ${r.pulled}, новых задач ${r.imported}${r.removed ? `, удалено задач из удалённых событий ${r.removed}` : ''}.`
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

// ---- Часы: быстрый ввод во «Входящие»
const watch = ref<CaptureInfo | null>(null)
const watchKey = ref('')              // свежесозданный ключ: показываем один раз, потом он нигде не хранится
const watchMsg = ref('')
const watchBusy = ref(false)
const watchText = computed(() => `capture.url=${captureUrl}\ncapture.key=${watchKey.value}\n`)
async function loadWatch() { if (repo.mode === 'supabase') { try { watch.value = await repo.captureInfo() } catch (e) { watchMsg.value = (e as Error).message } } }
async function createWatchKey() {
  if (watch.value && !window.confirm('Создать новый ключ? Старый перестанет работать, приложение на часах придётся пересобрать с новым.')) return
  watchBusy.value = true; watchMsg.value = ''
  try { watchKey.value = await repo.captureCreate(); await loadWatch() } catch (e) { watchMsg.value = (e as Error).message }
  watchBusy.value = false
}
async function revokeWatchKey() {
  if (!window.confirm('Отозвать ключ? Часы больше не смогут добавлять задачи.')) return
  watchBusy.value = true; watchMsg.value = ''
  try { await repo.captureRevoke(); watchKey.value = ''; await loadWatch() } catch (e) { watchMsg.value = (e as Error).message }
  watchBusy.value = false
}
async function copyWatch() {
  try { await navigator.clipboard.writeText(watchText.value); watchMsg.value = 'Скопировано.' } catch { watchMsg.value = 'Не удалось скопировать — выдели текст и скопируй вручную.' }
}
onMounted(loadWatch)

// ---- Цвета сфер: набор задаётся одной строкой, разбирается на лету
const colorsText = ref(app.sphereColors.join(' '))
const colorsMsg = ref('')
const parsedColors = computed(() => parseColors(colorsText.value))
const tooManyColors = computed(() => parsedColors.value.colors.length > MAX_SPHERE_COLORS)
/** В поле не то, что сохранено: «Раскрасить» применяет только сохранённый набор */
const colorsDirty = computed(() => parsedColors.value.colors.join(' ') !== app.sphereColors.join(' ') || !!parsedColors.value.invalid.length)
const colorsSavable = computed(() => parsedColors.value.colors.length > 0 && !parsedColors.value.invalid.length && !tooManyColors.value)
async function saveColors() {
  colorsMsg.value = ''
  if (await app.saveSphereColors(parsedColors.value.colors)) {
    colorsText.value = parsedColors.value.colors.join(' ')
    colorsMsg.value = 'Сохранено: эти цвета теперь предлагаются при создании и редактировании сферы.'
  }
}
async function resetColors() {
  colorsMsg.value = ''
  if (await app.saveSphereColors(null)) {
    colorsText.value = DEFAULT_SPHERE_COLORS.join(' ')
    colorsMsg.value = 'Вернулся набор по умолчанию.'
  }
}
async function recolor() {
  colorsMsg.value = ''
  if (!window.confirm('Раскрасить все сферы цветами набора по порядку? Текущие цвета сфер заменятся.')) return
  if (await app.recolorSpheres()) colorsMsg.value = 'Сферы раскрашены.'
}

async function logout() { await app.signOut(); router.push('/login') }
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold">Ещё</h1>

  <section class="mb-6" data-test="modules">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Модули</h2>
    <div class="card divide-y divide-line">
      <label v-for="m in MODULES" :key="m.key" class="flex cursor-pointer items-start gap-3 px-4 py-3" :data-test="'module-' + m.key">
        <input type="checkbox" class="mt-1" :checked="app.modOn(m.key)" @change="app.setModule(m.key, ($event.target as HTMLInputElement).checked)" />
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-medium">{{ m.label }}</span>
          <span class="block text-xs text-mute">{{ m.hint }}</span>
        </span>
      </label>
    </div>
    <p class="mt-2 px-1 text-xs text-mute">Выключенный модуль пропадает из приложения, но его данные остаются: включишь — всё на месте.<template v-if="!app.modulesReady"> Сейчас выбор хранится на этом устройстве; чтобы он был общим для сайта и телефона, выполни <code>planner_modules.sql</code> в Supabase (SQL Editor).</template></p>
  </section>

  <section class="mb-6" data-test="stale-settings">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Отложенные задачи</h2>
    <div class="card space-y-2 p-4">
      <label class="flex items-center justify-between gap-3 text-sm">Возвращать во «Входящие», если не трогала, дней
        <input type="number" min="1" max="365" class="input !w-24" :value="app.staleDays" aria-label="Через сколько дней отложенная задача возвращается во «Входящие»"
          data-test="stale-days" @change="app.setStaleDays(Number(($event.target as HTMLInputElement).value))" />
      </label>
      <p class="text-xs text-mute">Задачи со сферой, но без даты лежат во «Входящих» в свёрнутом блоке «Отложено». Залежавшиеся поднимаются наверх с вопросом «решить?». Настройка хранится на этом устройстве.</p>
    </div>
  </section>

  <section class="mb-6" data-test="sphere-colors">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Цвета сфер</h2>
    <div class="card space-y-3 p-4 text-sm">
      <p class="text-xs text-mute">Hex-цвета через пробел или запятую, например <code>#3E8E5F #7B5CC4, D9783A</code>. Они предлагаются при создании и редактировании сферы.</p>
      <p v-if="!app.colorsReady" class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Чтобы сохранять свой набор, выполни <code>planner_sphere_colors.sql</code> в Supabase (SQL Editor).</p>
      <textarea v-model="colorsText" rows="2" class="input font-mono !text-sm" spellcheck="false" aria-label="Цвета сфер в формате hex" placeholder="#3E8E5F #7B5CC4 #D9783A" data-test="colors-input" @input="colorsMsg = ''"></textarea>
      <div v-if="parsedColors.colors.length" class="flex flex-wrap gap-1.5" data-test="colors-preview">
        <span v-for="c in parsedColors.colors" :key="c" class="h-7 w-7 rounded-full border border-line" :style="{ background: c }" :title="c"></span>
      </div>
      <p v-if="parsedColors.invalid.length" class="text-xs text-red-700" data-test="colors-invalid">Не похоже на цвет: {{ parsedColors.invalid.join(', ') }}</p>
      <p v-if="tooManyColors" class="text-xs text-red-700">Слишком много цветов: не больше {{ MAX_SPHERE_COLORS }}.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" :disabled="!colorsSavable || !colorsDirty || !app.colorsReady" data-test="colors-save" @click="saveColors">Сохранить</button>
        <button type="button" class="btn-ghost" :disabled="!app.spheres.length || colorsDirty" data-test="colors-recolor" :title="colorsDirty ? 'Сначала сохрани набор' : 'Применить набор к существующим сферам'" @click="recolor">Раскрасить сферы</button>
        <button v-if="app.hasOwnColors" type="button" class="btn-ghost" data-test="colors-reset" @click="resetColors">По умолчанию</button>
      </div>
      <p v-if="colorsMsg" class="text-xs text-accent">{{ colorsMsg }}</p>
    </div>
  </section>

  <section class="mb-6" data-test="tags-settings">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Теги</h2>
    <div class="card p-4">
      <p v-if="!app.tagsReady" class="text-sm text-amber-800">Чтобы пользоваться тегами, выполни <code>planner_tags.sql</code> в Supabase (SQL Editor).</p>
      <template v-else>
        <p class="mb-3 text-sm text-mute">Тег ставится прямо в тексте задачи: «Позвонить в банк #звонки». Нажми на тег у задачи — увидишь все задачи с ним.</p>
        <p v-if="!app.allTags.length" class="text-sm text-mute">Тегов пока нет.</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="x in app.allTags" :key="x.tag" class="flex items-center gap-3 py-2 text-sm" data-test="tag-row">
            <button type="button" class="font-medium text-accent hover:underline" @click="app.openSearch('#' + x.tag + ' ')">#{{ x.tag }}</button>
            <span class="flex-1 text-xs text-mute">{{ x.count }}</span>
            <button type="button" class="text-xs font-semibold text-accent" data-test="tag-rename" @click="renameTag(x.tag)">Переименовать</button>
            <button type="button" class="text-xs text-mute hover:text-red-700" data-test="tag-remove" @click="removeTag(x.tag, x.count)">Удалить</button>
          </li>
        </ul>
        <p v-if="tagMsg" class="mt-2 text-xs text-accent">{{ tagMsg }}</p>
      </template>
    </div>
  </section>

  <section class="mb-6">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Бюджет времени</h2>
    <form class="card space-y-3 p-4" data-test="budget-settings" @submit.prevent="saveBudget">
      <p class="text-sm text-mute">Это время вычитается из недели, прежде чем делить её между сферами. Часы работы задаются в итоге недели (на следующую) или на экране «Сферы».</p>
      <label class="flex items-center justify-between gap-3 text-sm">Сон, часов в день
        <input v-model.number="sleepH" type="number" min="0" max="24" step="0.5" class="input !w-24" aria-label="Сон, часов в день" />
      </label>
      <label class="flex items-center justify-between gap-3 text-sm">Текучка, часов в день
        <input v-model.number="routineH" type="number" min="0" max="24" step="0.5" class="input !w-24" aria-label="Текучка, часов в день" />
      </label>
      <p class="text-xs text-mute">Текучка — еда, дорога, душ, уборка, покупки: то, что не относится ни к одной сфере.</p>
      <button class="btn-primary w-full" :disabled="!app.timeBudgetReady">Сохранить</button>
      <p v-if="!app.timeBudgetReady" class="text-xs text-amber-800">Чтобы сохранять, выполни <code>planner_time_budget.sql</code> в Supabase (SQL Editor).</p>
      <p v-if="budgetMsg" class="text-xs text-accent">{{ budgetMsg }}</p>
    </form>
  </section>

  <section class="mb-6">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Экспорт данных</h2>
    <div class="card space-y-3 p-4">
      <div>
        <button class="btn-primary w-full" :disabled="busy" @click="run('json')">Скачать всё · JSON</button>
        <p class="mt-1 text-xs text-mute">Полная копия для восстановления: сферы, задачи, повторы, привычки, время, цели, итоги недель, часы работы, желания, книги, фильмы и чек-лист.</p>
        <label class="mt-2 flex items-center gap-2 text-sm"><input v-model="withCycle" type="checkbox" data-test="export-cycle" /> Включить календарь цикла</label>
        <p class="mt-1 text-xs text-mute">Без галочки цикл из этого файла не восстановится. Такой файл с данными цикла храни только в личном месте.</p>
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
      <RestoreData class="border-t border-line pt-3" />
    </div>
  </section>

  <section class="mb-6">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Уведомления</h2>
    <!-- В приложении для телефона — системные напоминания, на сайте — web-push -->
    <NativeNotifications v-if="isNative" />
    <div v-else class="card space-y-3 p-4 text-sm">
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
      <p class="text-mute">Задачи со временем появляются в твоём Google Календаре, а события из Google — в KolaApp. Изменения идут в обе стороны.</p>
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
          <div v-if="g.can_list_calendars === false" class="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
            <p>Сейчас синхронизируется только основной календарь. Чтобы выбрать другие (рабочий, учебный…), дай приложению доступ к списку календарей.</p>
            <button class="btn-ghost" :disabled="app.googleBusy" @click="connectGoogleNow">Дать доступ к списку календарей</button>
          </div>
          <div v-else-if="g.calendars?.length" class="space-y-2">
            <div class="text-sm font-medium">Брать события из календарей</div>
            <label v-for="c in g.calendars" :key="c.id" class="flex items-center gap-2">
              <input type="checkbox" :checked="g.import_calendar_ids?.includes(c.id)" :disabled="!g.import_events" @change="app.toggleImportCalendar(c.id, ($event.target as HTMLInputElement).checked)" />
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: c.color || '#9ca3af' }"></span>
              <span class="min-w-0 truncate">{{ c.summary }}<span v-if="!c.writable" class="text-xs text-mute"> · только чтение</span></span>
            </label>
            <label class="block">
              <span class="text-sm font-medium">Задачи из приложения отправлять в</span>
              <select class="input mt-1 w-full" :value="g.export_calendar_id" @change="app.setExportCalendar(($event.target as HTMLSelectElement).value)">
                <option v-for="c in g.calendars.filter(x => x.writable)" :key="c.id" :value="c.id">{{ c.summary }}</option>
              </select>
            </label>
            <p class="text-xs text-mute">Уже созданные события остаются в своих календарях. События календарей «только чтение» в Google не меняются.</p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button class="btn-ghost" :disabled="app.googleBusy || gWorking" @click="syncNow">{{ app.googleBusy ? 'Синхронизирую…' : 'Синхронизировать' }}</button>
            <button class="btn-ghost" :disabled="app.googleBusy" @click="disconnectNow">Отключить</button>
          </div>
        </template>
        <template v-else>
          <p v-if="!g.configured" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">На сервере не заданы ключи Google. Выполни шаг 3 из GOOGLE.md.</p>
          <!-- Google не пускает вход внутри приложений, поэтому подключение — в браузере; синхронизация потом идёт на сервере и для телефона тоже -->
          <p v-if="isNative" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Подключить Google Календарь можно в веб-версии KolaApp (в браузере). После этого синхронизация будет работать и в приложении.</p>
          <button v-else class="btn-primary w-full" :disabled="app.googleBusy || gWorking" @click="connectGoogleNow">{{ app.googleBusy || gWorking ? 'Подключаю…' : 'Подключить Google Календарь' }}</button>
        </template>
      </template>
      <p v-if="app.googleError && gStatus !== 'not-deployed'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{{ app.googleError }}</p>
      <p v-else-if="g?.connected && g.last_error" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{{ g.last_error }}</p>
      <p v-if="gMsg" class="text-xs text-mute">{{ gMsg }}</p>
    </div>
  </section>

  <section class="mb-6">
    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">Часы · быстрый ввод</h2>
    <div class="card space-y-3 text-sm">
      <p class="text-mute">Приложение для часов (Wear OS) добавляет задачи во «Входящие». Ему нужен личный ключ: он позволяет только добавлять задачи и ничего не читает. Инструкция — в папке <code>watch/</code> (README).</p>
      <p v-if="repo.mode === 'demo'" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Работает только при подключённом Supabase.</p>
      <template v-else>
        <p v-if="watch" class="rounded-lg bg-accent-soft px-3 py-2 text-accent">Ключ создан {{ when(watch.created_at) }}. Последний ввод с часов: {{ watch.last_used_at ? when(watch.last_used_at) : 'ещё не было' }}.</p>
        <div v-if="watchKey" class="space-y-2">
          <p class="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Скопируй настройки сейчас: ключ показывается один раз. Положи их в файл <code>watch/capture.properties</code> и никому не показывай.</p>
          <textarea class="input w-full font-mono text-xs" rows="3" readonly :value="watchText" @focus="($event.target as HTMLTextAreaElement).select()"></textarea>
          <button class="btn-ghost w-full" @click="copyWatch">Скопировать настройки</button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn-primary" :disabled="watchBusy" @click="createWatchKey">{{ watch ? 'Новый ключ' : 'Создать ключ' }}</button>
          <button class="btn-ghost" :disabled="watchBusy || !watch" @click="revokeWatchKey">Отозвать</button>
        </div>
      </template>
      <p v-if="watchMsg" class="text-xs text-mute">{{ watchMsg }}</p>
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
