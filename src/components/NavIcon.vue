<script setup lang="ts">
defineProps<{ name: 'inbox' | 'today' | 'spheres' | 'review' | 'wishes' | 'library' | 'movies' | 'shopping' | 'monthly' | 'misc' | 'more' | 'diary' }>()
</script>
<template>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <template v-if="name === 'inbox'"><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></template>
    <template v-else-if="name === 'today'"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></template>
    <template v-else-if="name === 'spheres'"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v5" /></template>
    <template v-else-if="name === 'diary'"><path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6z" /><path d="M6 3.5v17M9.5 8h5.5M9.5 11.5h5.5" /></template>
    <template v-else-if="name === 'review'"><path d="M5 20V10M12 20V4M19 20v-7" /></template>
    <template v-else-if="name === 'wishes'"><path d="M12 3.5l2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.4-4 5.9-.7z" /></template>
    <template v-else-if="name === 'library'"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" /></template>
    <template v-else-if="name === 'movies'"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M8 4.5v15M16 4.5v15M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5" /></template>
    <template v-else-if="name === 'shopping'"><path d="M3.5 4.5h2.2l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h7.7a1.6 1.6 0 0 0 1.6-1.2l1.6-6.3H6.6" /><circle cx="10" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></template>
    <template v-else-if="name === 'monthly'"><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M8.5 15l2.3 2.3 4.7-4.6" /></template>
    <template v-else-if="name === 'misc'"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></template>
    <template v-else><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></template>
  </svg>
</template>
