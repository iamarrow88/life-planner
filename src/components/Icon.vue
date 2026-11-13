<script setup lang="ts">
/**
 * Линейные иконки приложения (в том же стиле, что меню): вместо эмодзи и значков-символов в кнопках и метках.
 * Цвет — от текста (currentColor), размер — size в пикселях. filled — залитая (например, ♥ в избранном).
 */
withDefaults(defineProps<{
  name: 'play' | 'stop' | 'timer' | 'repeat' | 'postpone' | 'edit' | 'heart' | 'note' | 'link' | 'print' | 'tag' | 'folder' | 'pill' | 'sparkle' | 'checklist' | 'lines'
  size?: number; filled?: boolean
}>(), { size: 16, filled: false })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    class="inline-block shrink-0 align-[-0.125em]" aria-hidden="true">
    <path v-if="name === 'play'" d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
    <rect v-else-if="name === 'stop'" x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    <template v-else-if="name === 'timer'"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9.5 2.5h5" /></template>
    <template v-else-if="name === 'repeat'"><path d="M4 11V9a4 4 0 0 1 4-4h11" /><path d="M16 2l3 3-3 3" /><path d="M20 13v2a4 4 0 0 1-4 4H5" /><path d="M8 22l-3-3 3-3" /></template>
    <template v-else-if="name === 'postpone'"><path d="M4 18v-5a6 6 0 0 1 6-6h10" /><path d="M16 3l4 4-4 4" /></template>
    <template v-else-if="name === 'edit'"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></template>
    <path v-else-if="name === 'heart'" d="M12 20s-7-4.4-9.2-9A4.9 4.9 0 0 1 12 6.2 4.9 4.9 0 0 1 21.2 11C19 15.6 12 20 12 20z" :fill="filled ? 'currentColor' : 'none'" />
    <template v-else-if="name === 'note'"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></template>
    <template v-else-if="name === 'link'"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></template>
    <template v-else-if="name === 'print'"><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></template>
    <template v-else-if="name === 'tag'"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" /></template>
    <path v-else-if="name === 'folder'" d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
    <template v-else-if="name === 'pill'"><rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)" /><path d="M8.5 8.5l7 7" /></template>
    <path v-else-if="name === 'sparkle'" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" />
    <template v-else-if="name === 'checklist'"><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 12l3 3 5-6" /></template>
    <path v-else-if="name === 'lines'" d="M5 7h14M5 12h14M5 17h9" />
  </svg>
</template>
