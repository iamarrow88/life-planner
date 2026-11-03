import type { CapacitorConfig } from '@capacitor/cli'

// Приложение для Android: та же сборка, что и сайт (npm run android собирает её в dist и копирует в android/)
const config: CapacitorConfig = {
  appId: 'by.kolaapp.app',
  appName: 'KolaApp',
  webDir: 'dist',
  backgroundColor: '#F6F4EF',
  android: { backgroundColor: '#F6F4EF' },
  plugins: {
    // приложение не заходит под строку состояния и полосу навигации: Android сам оставляет для них место
    SystemBars: { insetsHandling: 'native', style: 'LIGHT' },
    LocalNotifications: { smallIcon: 'ic_stat_kola', iconColor: '#1F6F6B' },
  },
}

export default config
