<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { addDays, shortDate, weekStart } from '../lib/time'
import DiaryDay from '../components/DiaryDay.vue'
import SettingsLink from '../components/SettingsLink.vue'

/** Дневник: недели от текущей назад, внутри — дни от новых к старым; в конце недели — её итог */
const app = useApp()
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const weeksShown = ref(4)
const weeks = computed(() => {
  const cur = weekStart(app.today)
  return Array.from({ length: weeksShown.value }, (_, i) => {
    const ws = addDays(cur, -7 * i)
    const last = [addDays(ws, 6), app.today].sort()[0]
    const days: string[] = []
    for (let d = last; d >= ws; d = addDays(d, -1)) days.push(d)
    const filled = days.filter(d => { const e = app.journalFor(d); return !!(e?.text || e?.mood || e?.favorite) }).length
    return { ws, days, filled, month: MONTHS[Number(last.slice(5, 7)) - 1], review: app.reviewFor(ws), current: ws === cur }
  })
})
/** Заголовок месяца — перед первой неделей этого месяца */
const showMonth = (i: number) => i === 0 || weeks.value[i].month !== weeks.value[i - 1].month
const snippet = (t: string | null | undefined) => (t && t.length > 140 ? t.slice(0, 140) + '…' : t ?? '')
</script>

<template>
  <h1 class="mb-1 flex items-center text-2xl font-bold"><span class="mr-auto">Дневник</span><SettingsLink /></h1>
  <p class="mb-4 text-sm text-mute">Пара строк о дне, настроение и ♥ для дней, которые хочется помнить.</p>
  <p v-if="!app.journalReady" class="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Чтобы записи сохранялись, выполни <code>planner_journal.sql</code> в Supabase (SQL Editor).</p>

  <template v-for="(w, i) in weeks" :key="w.ws">
    <h2 v-if="showMonth(i)" class="mb-2 mt-2 text-lg font-bold">{{ w.month }}</h2>
    <section class="mb-6" :data-week="w.ws" data-test="diary-week">
      <div class="mb-2 flex items-baseline justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-mute">
        <span>{{ shortDate(w.ws) }} – {{ shortDate(addDays(w.ws, 6)) }}</span>
        <span>записей {{ w.filled }}/{{ w.days.length }}</span>
      </div>
      <div class="space-y-2">
        <DiaryDay v-for="d in w.days" :key="d" :day="d" />
      </div>
      <!-- Итог недели — в конце недели -->
      <RouterLink :to="w.current ? '/review' : '/review?week=' + w.ws" class="card mt-2 flex items-center gap-3 px-4 py-3 hover:border-accent" data-test="diary-review">
        <span class="min-w-0 flex-1">
          <span class="block font-semibold" :class="w.review?.completed_at ? 'text-ink' : 'text-accent'">Итог недели<template v-if="w.review?.completed_at"> ✓</template></span>
          <span v-if="w.review?.completed_at && w.review.went_well" class="block whitespace-pre-line text-xs text-mute">Получилось: {{ snippet(w.review.went_well) }}</span>
          <span v-else-if="w.review?.completed_at" class="block text-xs text-mute">Подведён</span>
          <span v-else class="block text-xs text-mute">{{ w.current ? 'Цифры недели, три вопроса и план на следующую' : 'Не подведён — можно вернуться и заполнить' }}</span>
        </span>
        <span class="text-mute">›</span>
      </RouterLink>
    </section>
  </template>
  <button type="button" class="btn-ghost w-full" data-test="diary-more" @click="weeksShown += 4">Показать раньше</button>
</template>
