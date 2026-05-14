import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: () => import('./pages/Dashboard.vue') },
  { path: '/projects', name: 'projects', component: () => import('./pages/Projects.vue') },
  { path: '/sessions', name: 'sessions', component: () => import('./pages/Sessions.vue') },
  {
    path: '/sessions/:provider/:sessionId',
    name: 'session-detail',
    component: () => import('./pages/SessionDetail.vue'),
    props: true,
  },
  { path: '/search', name: 'search', component: () => import('./pages/Search.vue') },
  { path: '/settings', name: 'settings', component: () => import('./pages/Settings.vue') },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
