/** @type {import('tailwindcss').Config} */
export default {
  // на телефоне «наведение» не должно залипать на нажатой кнопке
  future: { hoverOnlyWhenSupported: true },
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Onest', 'system-ui', 'sans-serif'] },
      colors: {
        bg: '#F1EEFB', card: '#FFFFFF', ink: '#211D38', mute: '#625F78', line: '#E8E4F3',
        // пыльная лаванда: спокойнее насыщенного фиолетового; текст accent на accent-soft — контраст 4.5+
        accent: { DEFAULT: '#6B63A3', soft: '#EEECF7', deep: '#3F3872' },
        // зелёный — только для сделанного: выполненные задачи, отметки и потраченное время
        success: { DEFAULT: '#1D7052', soft: '#E1F3EB' },
      },
    },
  },
}
