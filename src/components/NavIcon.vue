<script setup lang="ts">
defineProps<{ name: 'inbox' | 'today' | 'spheres' | 'review' | 'wishes' | 'library' | 'misc' | 'more' }>()
</script>
<template>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <template v-if="name === 'inbox'"><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></template>
    <template v-else-if="name === 'today'"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></template>
    <template v-else-if="name === 'spheres'"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v5" /></template>
    <template v-else-if="name === 'review'"><path d="M5 20V10M12 20V4M19 20v-7" /></template>
    <template v-else-if="name === 'wishes'"><path d="M12 3.5l2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.4-4 5.9-.7z" /></template>
    <template v-else-if="name === 'library'"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" /></template>
    <template v-else-if="name === 'misc'"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></template>
    <template v-else><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></template>
  </svg>
</template>
