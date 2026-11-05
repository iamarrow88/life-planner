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
        accent: { DEFAULT: '#5F4BC9', soft: '#ECE9FC', deep: '#35267F' },
        // зелёный — только для сделанного: выполненные задачи, отметки и потраченное время
        success: { DEFAULT: '#1D7052', soft: '#E1F3EB' },
      },
    },
  },
}
