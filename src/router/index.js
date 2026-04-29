import { createRouter, createWebHistory } from 'vue-router'
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '../api/http'

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
    component: () => import('../views/ParentCenter.vue')
  },
  {
    path: '/parent/edit',
    name: 'ParentEdit',
    component: () => import('../views/parent/EditProfile.vue')
  },
  {
    path: '/parent/requests',
    name: 'ParentRequests',
    component: () => import('../views/parent/Requests.vue')
  },
  {
    path: '/parent/requests/:id',
    name: 'ParentRequestDetail',
    component: () => import('../views/parent/RequestDetail.vue')
  },
  {
    path: '/parent/reviews',
    name: 'ParentReviews',
    component: () => import('../views/parent/Reviews.vue')
  },
  {
    path: '/parent/vip',
    name: 'ParentVip',
    component: () => import('../views/parent/VipCenter.vue')
  },
  {
    path: '/parent/settings',
    name: 'ParentSettings',
    component: () => import('../views/parent/Settings.vue')
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
        path: 'notifications',
        name: 'TeacherNotifications',
        component: () => import('../views/teacher/Notifications.vue')
      },
      {
        path: 'analytics',
        name: 'TeacherAnalytics',
        component: () => import('../views/teacher/Analytics.vue')
      },
      {
        path: 'questionnaire',
        name: 'TeacherQuestionnaire',
        component: () => import('../views/teacher/Questionnaire.vue')
      },
      {
        path: 'match-pool',
        name: 'TeacherMatchPool',
        component: () => import('../views/teacher/MatchPool.vue')
      },
      {
        path: 'unlock-records',
        name: 'TeacherUnlockRecords',
        component: () => import('../views/teacher/UnlockRecords.vue')
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

const authPages = new Set(['/login', '/register', '/teacher-auth'])
const sharedProtectedPrefixes = ['/messages']
const parentProtectedPrefixes = ['/parent', '/parent-center']
const teacherProtectedPrefixes = ['/teacher', '/teacher-center']

const hasPrefix = (path, prefixes) => prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))

const getStoredRole = () => {
  if (typeof window === 'undefined') return ''
  const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY)
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return String(parsed?.role || '')
  } catch {
    return ''
  }
}

router.beforeEach((to) => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '' : ''
  const role = getStoredRole()

  const inParentArea = hasPrefix(to.path, parentProtectedPrefixes)
  const inTeacherArea = hasPrefix(to.path, teacherProtectedPrefixes)
  const inSharedProtectedArea = hasPrefix(to.path, sharedProtectedPrefixes)
  const needsAuth = inParentArea || inTeacherArea || inSharedProtectedArea

  if (!token && needsAuth) {
    return inTeacherArea ? '/teacher-auth' : '/login'
  }

  if (token && authPages.has(to.path)) {
    return role === 'teacher' ? '/teacher-center' : '/parent-center'
  }

  if (token && role === 'parent' && inTeacherArea) {
    return '/parent-center'
  }
  if (token && role === 'teacher' && inParentArea) {
    return '/teacher-center'
  }

  return true
})

export default router
