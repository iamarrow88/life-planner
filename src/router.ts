import { createRouter, createWebHistory } from 'vue-router'
import { useApp } from './stores/app'
import { MODULE_ROUTES } from './lib/modules'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/inbox' },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/inbox', component: () => import('./views/InboxView.vue') },
    {
      path: '/today',
      // календарь цикла живёт внутри «Сегодня»: отдельной вкладки в меню у него нет
      children: [
        { path: '', component: () => import('./views/TodayView.vue') },
        { path: 'cycle', component: () => import('./views/CycleView.vue') },
      ],
    },
    {
      path: '/spheres',
      // вложенные пути: на карточке сферы вкладка «Сферы» в меню остаётся подсвеченной
      children: [
        { path: '', component: () => import('./views/SpheresView.vue') },
        { path: ':id', component: () => import('./views/SphereView.vue') },
      ],
    },
    { path: '/diary', component: () => import('./views/DiaryView.vue') },
    { path: '/review', component: () => import('./views/ReviewView.vue') },
    { path: '/misc', component: () => import('./views/MiscView.vue') },
    { path: '/wishes', component: () => import('./views/WishesView.vue') },
    { path: '/library', component: () => import('./views/LibraryView.vue') },
    { path: '/movies', component: () => import('./views/MoviesView.vue') },
    { path: '/shopping', component: () => import('./views/ShoppingView.vue') },
    { path: '/monthly', component: () => import('./views/MonthlyView.vue') },
    { path: '/more', component: () => import('./views/MoreView.vue') },
  ],
})

router.beforeEach(async to => {
  const app = useApp()
  if (!app.ready) await app.init()
  if (!to.meta.public && !app.user) return '/login'
  if (to.path === '/login' && app.user) return '/inbox'
  // раздел выключенного модуля: возвращаем туда, откуда в него приходят
  const mod = MODULE_ROUTES[to.path.replace(/\/$/, '')]
  if (mod && !app.modOn(mod)) return mod === 'cycle' ? '/today' : '/misc'
})
