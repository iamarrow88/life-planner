<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useApp } from './stores/app'
import NavIcon from './components/NavIcon.vue'
import TimerBar from './components/TimerBar.vue'
import TimeEditor from './components/TimeEditor.vue'
import LongTimerFix from './components/LongTimerFix.vue'
import TaskDetail from './components/TaskDetail.vue'
import HabitDetail from './components/HabitDetail.vue'
import TaskSearch from './components/TaskSearch.vue'
import PullToRefresh from './components/PullToRefresh.vue'
import PostponeSheet from './components/PostponeSheet.vue'
import { repo, supabaseProblems } from './data'
import { initNative } from './lib/native'

/** Логотип из public/ (учитывает папку сайта, например /life-planner/) */
const logo = import.meta.env.BASE_URL + 'icon.svg'

const app = useApp()
const route = useRoute()
const router = useRouter()
// приложение для телефона: системные напоминания, кнопка «Назад», статус-бар
void initNative(app, router)
const tabs = [
  { to: '/inbox', label: 'Входящие', icon: 'inbox' },
  { to: '/today', label: 'Сегодня', icon: 'today' },
  { to: '/spheres', label: 'Сферы', icon: 'spheres' },
  { to: '/misc', label: 'Разное', icon: 'misc' },
  { to: '/more', label: 'Ещё', icon: 'more' },
] as const
/** Разделы без своей вкладки: пока они открыты, подсвечена вкладка, из которой в них приходят */
const parentTab = computed(() => (route.path === '/review' ? '/spheres' : ['/wishes', '/library', '/movies', '/shopping', '/monthly'].includes(route.path) ? '/misc' : null))
const showShell = computed(() => !!app.user && route.path !== '/login')
const badge = computed(() => app.inbox.length + app.staleDeferred.length)
/** Прокручиваемая часть экрана: на ней работает «потяни вниз — обновится» */
const mainEl = ref<HTMLElement | null>(null)
async function logout() { await app.signOut(); router.push('/login') }
</script>

<template>
  <div v-if="!app.ready" class="grid h-full place-items-center text-mute">Загрузка…</div>
  <RouterView v-else-if="!showShell" />
  <div v-else class="flex h-full flex-col md:flex-row">
    <!-- Боковое меню на ПК -->
    <aside class="hidden w-60 shrink-0 flex-col border-r border-line bg-white/60 p-4 md:flex">
      <div class="mb-6 flex items-center gap-2 px-2 text-lg font-bold text-accent-deep">
        <img :src="logo" alt="" class="h-8 w-8" /> KolaApp
      </div>
      <nav class="flex flex-col gap-1">
        <RouterLink v-for="t in tabs" :key="t.to" :to="t.to"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-mute hover:bg-accent-soft"
          :class="t.to === parentTab && '!bg-accent-soft !text-accent'" active-class="!bg-accent-soft !text-accent">
          <NavIcon :name="t.icon" />
          <span class="flex-1">{{ t.label }}</span>
          <span v-if="t.to === '/inbox' && badge" class="rounded-full bg-accent px-2 text-xs font-semibold text-white">{{ badge }}</span>
        </RouterLink>
      </nav>
      <div class="mt-auto px-2 text-xs text-mute">
        <div v-if="repo.mode === 'demo'" class="mb-2 rounded-lg bg-amber-50 p-2 text-amber-800">Демо-режим: данные хранятся только в этом браузере<template v-if="supabaseProblems.length">. Supabase не подключён: {{ supabaseProblems.join('; ') }}</template></div>
        <div class="truncate">{{ app.user?.email }}</div>
        <button v-if="repo.mode !== 'demo'" class="mt-1 font-semibold text-accent" @click="logout">Выйти</button>
      </div>
    </aside>

    <main ref="mainEl" class="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      <PullToRefresh :target="mainEl" />
      <TimerBar />
      <div v-if="repo.mode === 'demo'" class="bg-amber-50 px-4 py-2 text-xs text-amber-900">
        <b>Демо-режим:</b> данные хранятся только в этом браузере, входа и регистрации нет.
        <template v-if="supabaseProblems.length"><br />Supabase не подключён: <b>{{ supabaseProblems.join('; ') }}</b>. Проверь файл <code>.env</code> (рядом с package.json) и перезапусти <code>npm run dev</code>.</template>
        <template v-else> Подключи Supabase — см. README.</template>
      </div>
      <div class="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
        <div v-if="app.error" class="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{{ app.error }}</div>
        <RouterView />
      </div>
    </main>

    <PostponeSheet />
    <p v-if="app.notice" role="status" class="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-sm rounded-xl bg-ink px-4 py-2.5 text-center text-sm text-white shadow-lg md:bottom-6" data-test="notice">{{ app.notice }}</p>
    <TaskSearch />
    <TaskDetail />
    <HabitDetail />
    <TimeEditor />
    <LongTimerFix />

    <!-- Нижняя панель на телефоне -->
    <nav class="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-20 flex gap-0.5 rounded-[1.75rem] border border-white/70 bg-white/80 p-1 shadow-[0_6px_24px_rgba(76,58,160,0.18)] backdrop-blur-md md:hidden">
      <RouterLink v-for="t in tabs" :key="t.to" :to="t.to"
        class="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-3xl py-1.5 text-[11px] font-medium text-mute transition"
        :class="t.to === parentTab && '!bg-accent-soft !text-accent'" active-class="!bg-accent-soft !text-accent">
        <NavIcon :name="t.icon" />
        {{ t.label }}
        <span v-if="t.to === '/inbox' && badge" class="absolute right-[22%] top-0.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{{ badge }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
