<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { LIFE_SPHERES, guessLife, lifeByName } from '../lib/lifeSpheres'

/**
 * Переход на семь сфер жизни. Для каждой своей сферы выбираешь:
 * - «стать …» — сфера переименовывается в одну из семи (цели, задачи, время остаются при ней);
 * - «проект в …» — сфера становится проектом внутри одной из семи (как «Сделать проектом» на странице сферы);
 * - «оставить» — сфера остаётся как есть.
 * Недостающие из семи создаются, затем семь сфер встают в начало списка по порядку колеса.
 */
const emit = defineEmits<{ done: [] }>()
const app = useApp()

type Choice = { kind: 'keep' } | { kind: 'rename' | 'project'; life: number }
/** Сферы, которые уже называются как одна из семи, не трогаем */
const own = computed(() => app.spheres.filter(s => !lifeByName(s.name)))
const lifeTaken = (i: number) => app.spheres.some(s => lifeByName(s.name)?.name === LIFE_SPHERES[i].name)

/** Догадка: первая сфера для каждой из семи переименовывается, следующие становятся в ней проектами */
function initial(): Record<string, string> {
  const used = new Set<number>(LIFE_SPHERES.map((_, i) => i).filter(lifeTaken))
  const out: Record<string, string> = {}
  for (const s of own.value) {
    const g = guessLife(s.name)
    const i = g ? LIFE_SPHERES.findIndex(l => l.name === g.name) : -1
    if (i < 0) { out[s.id] = 'keep'; continue }
    out[s.id] = used.has(i) ? `project:${i}` : `rename:${i}`
    used.add(i)
  }
  return out
}
const choice = ref<Record<string, string>>(initial())
const parse = (v: string): Choice => (v === 'keep' ? { kind: 'keep' } : { kind: v.split(':')[0] as 'rename' | 'project', life: Number(v.split(':')[1]) })

/** Одна из семи может получиться переименованием только из одной сферы */
const renameClash = computed(() => {
  const seen = new Map<number, number>()
  for (const v of Object.values(choice.value)) { const c = parse(v); if (c.kind === 'rename') seen.set(c.life, (seen.get(c.life) ?? 0) + 1) }
  return LIFE_SPHERES.filter((_, i) => (seen.get(i) ?? 0) > 1 || ((seen.get(i) ?? 0) > 0 && lifeTaken(i))).map(l => l.name)
})
const counts = computed(() => {
  const cs = Object.values(choice.value).map(parse)
  const renamed = new Set(cs.filter(c => c.kind === 'rename').map(c => (c as { life: number }).life))
  return {
    rename: cs.filter(c => c.kind === 'rename').length,
    project: cs.filter(c => c.kind === 'project').length,
    create: LIFE_SPHERES.filter((_, i) => !lifeTaken(i) && !renamed.has(i)).length,
  }
})

const busy = ref(false)
const msg = ref('')
async function apply() {
  if (renameClash.value.length || busy.value) return
  const c = counts.value
  if (!window.confirm(`Переименовать сфер: ${c.rename}, превратить в проекты: ${c.project}, создать новых: ${c.create}. Задачи, привычки и учтённое время сохранятся. Отменить одной кнопкой это нельзя. Продолжить?`)) return
  busy.value = true; msg.value = ''
  try {
    const plan = Object.entries(choice.value).map(([id, v]) => ({ id, c: parse(v) }))
    // 1. переименования: сфера получает имя и цвет одной из семи
    for (const { id, c } of plan) {
      if (c.kind !== 'rename') continue
      const l = LIFE_SPHERES[c.life]
      if (!(await app.updateSphere(id, { name: l.name, color: l.color }))) throw new Error(app.error || `Не получилось переименовать сферу в «${l.name}»`)
    }
    // 2. недостающие из семи
    for (const l of LIFE_SPHERES) {
      if (app.spheres.some(s => lifeByName(s.name)?.name === l.name)) continue
      if (!(await app.addSphere(l.name, l.color, 0))) throw new Error(app.error || `Не получилось создать «${l.name}»`)
    }
    const idOf = (i: number) => app.spheres.find(s => lifeByName(s.name)?.name === LIFE_SPHERES[i].name)!.id
    // 3. остальные — проектами внутри своей сферы
    for (const { id, c } of plan) {
      if (c.kind !== 'project') continue
      if (!(await app.sphereToProject(id, idOf(c.life)))) throw new Error(app.error || 'Не получилось сделать сферу проектом')
    }
    // 4. семь сфер — в начало, по порядку колеса
    await app.reorderSpheres(LIFE_SPHERES.map((_, i) => idOf(i)))
    emit('done')
  } catch (e) {
    msg.value = (e as Error).message + '. То, что уже сделано, сохранено — можно поправить выбор и нажать ещё раз.'
  } finally {
    busy.value = false
    // после ошибки в списке остались только необработанные сферы: их выбор сохраняем
    choice.value = Object.fromEntries(own.value.map(s => [s.id, choice.value[s.id] ?? 'keep']))
  }
}
</script>

<template>
  <section class="card mb-4 space-y-3 p-4" data-test="sphere-migrate">
    <div>
      <h2 class="font-semibold">Перейти на 7 сфер жизни</h2>
      <p class="text-xs text-mute">Каждую свою сферу можно переименовать в одну из семи или сделать проектом внутри неё — задачи, привычки, цели и учтённое время сохранятся. Недостающие сферы создадутся сами.</p>
    </div>
    <ul class="divide-y divide-line rounded-xl border border-line bg-white/60">
      <li v-for="s in own" :key="s.id" class="flex flex-wrap items-center gap-2 px-3 py-2" data-test="migrate-row">
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: s.color }"></span>
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ s.name }}</span>
        <select v-model="choice[s.id]" class="input !w-auto max-w-full !py-1.5 !text-sm" :aria-label="'Что сделать со сферой ' + s.name" data-test="migrate-choice">
          <option value="keep">оставить как есть</option>
          <optgroup label="Переименовать в">
            <option v-for="(l, i) in LIFE_SPHERES" :key="'r' + i" :value="'rename:' + i" :disabled="lifeTaken(i)">{{ l.name }}</option>
          </optgroup>
          <optgroup label="Сделать проектом в">
            <option v-for="(l, i) in LIFE_SPHERES" :key="'p' + i" :value="'project:' + i">{{ l.name }}</option>
          </optgroup>
        </select>
      </li>
    </ul>
    <p v-if="renameClash.length" class="text-xs text-red-700">В одну сферу можно переименовать только одну: {{ renameClash.join(', ') }}. Остальные сделай проектами.</p>
    <p class="text-xs text-mute">Переименуется: {{ counts.rename }} · станут проектами: {{ counts.project }} · создастся новых: {{ counts.create }}</p>
    <p v-if="msg" class="text-xs text-red-700" role="alert">{{ msg }}</p>
    <div class="flex gap-2">
      <button type="button" class="btn-primary" :disabled="busy || !!renameClash.length" data-test="migrate-apply" @click="apply">{{ busy ? 'Переношу…' : 'Перейти' }}</button>
      <button type="button" class="btn-ghost" :disabled="busy" @click="emit('done')">Не сейчас</button>
    </div>
  </section>
</template>
