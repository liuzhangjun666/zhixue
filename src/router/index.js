import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/login',
    name: 'ParentLogin',
    component: () => import('../views/ParentLogin.vue'),
    meta: { hideNav: true, hideFooter: true }
  },
  {
    path: '/register',
    name: 'ParentRegister',
    component: () => import('../views/ParentRegister.vue')
  },
  {
    path: '/teacher-auth',
    name: 'TeacherAuth',
    component: () => import('../views/TeacherAuth.vue')
  },
  {
    path: '/messages',
    name: 'Messages',
    component: () => import('../views/Messages.vue')
  },
  {
    path: '/parent-center',
    name: 'ParentCenter',
    component: () => import('../views/ParentCenter.vue'),
    redirect: '/parent-center/edit',
    children: [
      {
        path: 'edit',
        name: 'ParentEdit',
        component: () => import('../views/parent/EditProfile.vue')
      },
      {
        path: 'requests',
        name: 'ParentRequests',
        component: () => import('../views/parent/Requests.vue')
      },
      {
        path: 'requests/:id',
        name: 'ParentRequestDetail',
        component: () => import('../views/parent/RequestDetail.vue')
      },
      {
        path: 'reviews',
        name: 'ParentReviews',
        component: () => import('../views/parent/Reviews.vue')
      },
      {
        path: 'vip',
        name: 'ParentVip',
        component: () => import('../views/parent/VipCenter.vue')
      },
      {
        path: 'settings',
        name: 'ParentSettings',
        component: () => import('../views/parent/Settings.vue')
      }
    ]
  },
  {
    path: '/teacher-center',
    name: 'TeacherCenter',
    component: () => import('../views/TeacherCenter.vue'),
    redirect: '/teacher-center/edit',
    children: [
      {
        path: 'edit',
        name: 'TeacherEdit',
        component: () => import('../views/teacher/EditProfile.vue')
      },
      {
        path: 'requests',
        name: 'TeacherRequests',
        component: () => import('../views/teacher/Requests.vue')
      },
      {
        path: 'reviews',
        name: 'TeacherReviews',
        component: () => import('../views/teacher/Reviews.vue')
      },
      {
        path: 'analytics',
        name: 'TeacherAnalytics',
        component: () => import('../views/teacher/Analytics.vue')
      },
      {
        path: 'vip',
        name: 'TeacherVip',
        component: () => import('../views/teacher/VipCenter.vue')
      },
      {
        path: 'settings',
        name: 'TeacherSettings',
        component: () => import('../views/teacher/Settings.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
