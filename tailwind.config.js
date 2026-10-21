/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Onest', 'system-ui', 'sans-serif'] },
      colors: {
        bg: '#F6F4EF', card: '#FFFFFF', ink: '#1E2A2A', mute: '#6B7776', line: '#E5E1D8',
        accent: { DEFAULT: '#1F6F6B', soft: '#E1EFED' },
      },
    },
  },
}
