<script setup lang="ts">
defineProps<{ name: 'inbox' | 'today' | 'spheres' | 'review' | 'more' }>()
</script>
<template>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <template v-if="name === 'inbox'"><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></template>
    <template v-else-if="name === 'today'"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></template>
    <template v-else-if="name === 'spheres'"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v5" /></template>
    <template v-else-if="name === 'review'"><path d="M5 20V10M12 20V4M19 20v-7" /></template>
    <template v-else><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></template>
  </svg>
</template>
