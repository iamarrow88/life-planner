import { createRouter, createWebHistory } from 'vue-router'
import { useApp } from './stores/app'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/inbox' },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/inbox', component: () => import('./views/InboxView.vue') },
    { path: '/today', component: () => import('./views/TodayView.vue') },
    {
      path: '/spheres',
      // вложенные пути: на карточке сферы вкладка «Сферы» в меню остаётся подсвеченной
      children: [
        { path: '', component: () => import('./views/SpheresView.vue') },
        { path: ':id', component: () => import('./views/SphereView.vue') },
      ],
    },
    { path: '/review', component: () => import('./views/ReviewView.vue') },
    { path: '/more', component: () => import('./views/MoreView.vue') },
  ],
})

router.beforeEach(async to => {
  const app = useApp()
  if (!app.ready) await app.init()
  if (!to.meta.public && !app.user) return '/login'
  if (to.path === '/login' && app.user) return '/inbox'
})
