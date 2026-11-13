<script setup lang="ts">
import { computed } from 'vue'
import { shortName } from '../lib/lifeSpheres'

/**
 * Колесо баланса: каждой сфере — равный сектор. Сектор заполняется от центра по доле времени сферы:
 * доля 1/N (поровну со всеми) и больше — сектор заполнен целиком. В центре — баланс из 10.
 */
const props = defineProps<{ rows: { id: string; name: string; color: string; minutes: number }[]; score: number }>()
const emit = defineEmits<{ open: [id: string] }>()

const CX = 150, CY = 150, R0 = 38, R = 100, LABEL_R = 124, GAP = 0.035
const total = computed(() => props.rows.reduce((s, r) => s + r.minutes, 0))
const pt = (r: number, a: number) => `${(CX + r * Math.cos(a)).toFixed(2)} ${(CY + r * Math.sin(a)).toFixed(2)}`
function wedge(r: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${pt(R0, a0)} L ${pt(r, a0)} A ${r} ${r} 0 ${large} 1 ${pt(r, a1)} L ${pt(R0, a1)} A ${R0} ${R0} 0 ${large} 0 ${pt(R0, a0)} Z`
}
const sectors = computed(() => {
  const n = props.rows.length
  const step = (2 * Math.PI) / Math.max(1, n)
  return props.rows.map((row, i) => {
    const a0 = -Math.PI / 2 + i * step + (n > 1 ? GAP : 0), a1 = -Math.PI / 2 + (i + 1) * step - (n > 1 ? GAP : 0)
    const share = total.value > 0 ? row.minutes / total.value : 0
    const fill = Math.min(1, share * n)
    const mid = (a0 + a1) / 2
    return {
      ...row, bg: wedge(R, a0, a1), fg: fill > 0 ? wedge(R0 + (R - R0) * fill, a0, a1) : '',
      lx: CX + LABEL_R * Math.cos(mid), ly: CY + LABEL_R * Math.sin(mid), label: shortName(row.name).toUpperCase(),
    }
  })
})
</script>

<template>
  <svg viewBox="0 0 300 300" class="mx-auto block w-full max-w-[300px]" role="img" :aria-label="'Баланс сфер: ' + score.toFixed(1) + ' из 10'" data-test="sphere-wheel">
    <g v-for="s in sectors" :key="s.id" class="cursor-pointer" role="link" :aria-label="s.name" data-test="wheel-sector" @click="emit('open', s.id)">
      <path :d="s.bg" :fill="s.color" fill-opacity="0.13" />
      <path v-if="s.fg" :d="s.fg" :fill="s.color" fill-opacity="0.85" />
      <text :x="s.lx" :y="s.ly" text-anchor="middle" dominant-baseline="middle" class="fill-mute text-[9px] font-semibold tracking-wide">{{ s.label }}</text>
    </g>
    <text :x="CX" :y="CY - 4" text-anchor="middle" dominant-baseline="middle" class="fill-ink text-[22px] font-bold" data-test="wheel-score">{{ score.toFixed(1) }}</text>
    <text :x="CX" :y="CY + 15" text-anchor="middle" dominant-baseline="middle" class="fill-mute text-[9px]">из 10</text>
  </svg>
</template>
