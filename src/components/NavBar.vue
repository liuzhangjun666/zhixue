<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, User, LogOut } from 'lucide-vue-next'
import { io } from 'socket.io-client'
import { API_BASE_URL, AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY, request, unwrapData } from '../api/http'
import { logout } from '../api/auth'

const router = useRouter()
const route = useRoute()
const currentPath = computed(() => route.path)
const SYSTEM_NOTICE_READ_KEY = 'zhixue_system_notice_read'

const isLoggedIn = ref(false)
const storedUser = ref<{ id?: number | string; role?: string } | null>(null)

const syncAuthState = () => {
  if (typeof window === 'undefined') {
    isLoggedIn.value = false
    storedUser.value = null
    return
  }
  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''
  const userRaw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY) || ''
  if (!token || !userRaw) {
    isLoggedIn.value = false
    storedUser.value = null
    return
  }
  try {
    const parsed = JSON.parse(userRaw)
    storedUser.value = parsed && typeof parsed === 'object' ? parsed : null
    isLoggedIn.value = Boolean(storedUser.value)
  } catch {
    storedUser.value = null
    isLoggedIn.value = false
  }
}

const userRole = computed(() => {
  const role = String(storedUser.value?.role || '')
  if (role === 'teacher' || role === 'parent') return role
  if (route.path.startsWith('/teacher')) return 'teacher'
  return 'parent'
})

const userId = computed(() => Number(storedUser.value?.id || 0))
const discoverPath = computed(() => (userRole.value === 'teacher' ? '/teacher-center/match-pool' : '/discover'))

const unreadCount = ref(0)
const showNotifications = ref(false)
const getInitialNotifications = () => {
  const read = typeof window !== 'undefined' && window.localStorage.getItem(SYSTEM_NOTICE_READ_KEY) === '1'
  return [
    { id: 1, title: '系统通知', content: '欢迎使用知学空间，请完善您的个人资料。', time: '刚刚', read },
    { id: 2, title: '课程提醒', content: '您有一节试听课即将开始。', time: '2小时前', read }
  ]
}
const systemNotifications = ref(getInitialNotifications())
const systemUnreadCount = computed(() => systemNotifications.value.filter((n) => !n.read).length)

let logoutToastTimer: number | null = null
let unreadSocket: any = null
const WS_BASE_URL = API_BASE_URL ? new URL(API_BASE_URL, window.location.origin).origin : window.location.origin

const showUserMenu = ref(false)
const logoutToastVisible = ref(false)
const logoutToastText = ref('')

const persistSystemNotificationRead = () => {
  if (typeof window === 'undefined') return
  const hasUnread = systemNotifications.value.some((item) => !item.read)
  window.localStorage.setItem(SYSTEM_NOTICE_READ_KEY, hasUnread ? '0' : '1')
}

const toggleSystemNotifications = () => {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) {
    systemNotifications.value.forEach((n) => {
      n.read = true
    })
    persistSystemNotificationRead()
  }
}

const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value
}

const closeNotifications = (e: Event) => {
  if (!(e.target as Element).closest('.notification-container')) {
    showNotifications.value = false
  }
  if (!(e.target as Element).closest('.user-menu-container')) {
    showUserMenu.value = false
  }
}

const handleLogout = () => {
  showUserMenu.value = false
  logout()
    .then(() => {
      logoutToastText.value = '已退出登录'
      logoutToastVisible.value = true
      if (logoutToastTimer) window.clearTimeout(logoutToastTimer)
      logoutToastTimer = window.setTimeout(() => {
        logoutToastVisible.value = false
      }, 1800)
    })
    .finally(() => {
      disconnectUnreadSocket()
      unreadCount.value = 0
      syncAuthState()
      router.push('/')
    })
}

const fetchUnreadCount = async () => {
  if (!isLoggedIn.value || !userId.value) {
    unreadCount.value = 0
    return
  }
  try {
    const payload = await request('/api/messages/unread-count')
    const data = unwrapData(payload, { count: 0 })
    unreadCount.value = Number(data.count || 0)
  } catch {
    // Ignore transient network errors during polling.
  }
}

const disconnectUnreadSocket = () => {
  if (unreadSocket) {
    unreadSocket.disconnect()
    unreadSocket = null
  }
}

const connectUnreadSocket = () => {
  if (!isLoggedIn.value || !userId.value) {
    disconnectUnreadSocket()
    unreadCount.value = 0
    return
  }

  const token = typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '' : ''
  if (!token) {
    disconnectUnreadSocket()
    unreadCount.value = 0
    return
  }

  if (unreadSocket) return

  unreadSocket = io(WS_BASE_URL, { auth: { token } })

  unreadSocket.on('messages:unread-count', (payload: { count?: number }) => {
    unreadCount.value = Number(payload?.count || 0)
  })

  unreadSocket.on('connect', () => {
    fetchUnreadCount()
  })
}

const handleStorageChange = (event: StorageEvent) => {
  if (!event.key || event.key === AUTH_TOKEN_STORAGE_KEY || event.key === AUTH_USER_STORAGE_KEY) {
    syncAuthState()
    connectUnreadSocket()
    fetchUnreadCount()
  }
}

const handleWindowFocus = () => {
  syncAuthState()
  connectUnreadSocket()
  fetchUnreadCount()
}

watch(
  () => route.fullPath,
  () => {
    syncAuthState()
    connectUnreadSocket()
  }
)

onMounted(() => {
  syncAuthState()
  fetchUnreadCount()
  connectUnreadSocket()
  document.addEventListener('click', closeNotifications)
  window.addEventListener('storage', handleStorageChange)
  window.addEventListener('focus', handleWindowFocus)
})

onUnmounted(() => {
  disconnectUnreadSocket()
  if (logoutToastTimer) window.clearTimeout(logoutToastTimer)
  document.removeEventListener('click', closeNotifications)
  window.removeEventListener('storage', handleStorageChange)
  window.removeEventListener('focus', handleWindowFocus)
})
</script>

<template>
  <nav class="navbar">
    <div class="navbar-container">
      <div class="nav-left">
        <div class="logo">
          <div class="logo-icon">学</div>
          <span class="logo-text">知学空间</span>
        </div>
        <ul class="nav-menu">
          <li><router-link to="/" :class="{ active: currentPath === '/' }">首页</router-link></li>
          <li><router-link :to="discoverPath" :class="{ active: currentPath.includes('/match-pool') || currentPath.includes('/discover') }">发现</router-link></li>
          <li>
            <router-link
              to="/messages"
              class="nav-link-with-badge"
              :class="{ active: currentPath.includes('/messages') }"
            >
              消息
              <span v-if="unreadCount > 0" class="text-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
            </router-link>
          </li>
          <li>
            <router-link :to="userRole === 'teacher' ? '/teacher-center' : '/parent-center'" :class="{ active: currentPath.includes('-center') }">
              我的
            </router-link>
          </li>
        </ul>
      </div>

      <div class="nav-right">
        <template v-if="!isLoggedIn">
          <router-link to="/login" class="nav-link">登录</router-link>
          <span class="divider">/</span>
          <router-link to="/register" class="nav-link">注册</router-link>
          <span class="divider">/</span>
          <router-link to="/teacher-auth" class="nav-link">老师入口</router-link>
        </template>
        <template v-else>
          <div class="user-actions">
            <div class="notification-container">
              <button class="icon-btn notification-btn" @click.stop="toggleSystemNotifications">
                <Bell class="nav-icon" />
                <span v-if="systemUnreadCount > 0" class="badge"></span>
              </button>

              <div v-if="showNotifications" class="notification-dropdown">
                <div class="dropdown-header">
                  <h4>系统通知</h4>
                </div>
                <div class="dropdown-body">
                  <div v-for="note in systemNotifications" :key="note.id" class="note-item">
                    <div class="note-title">{{ note.title }}</div>
                    <div class="note-content">{{ note.content }}</div>
                    <div class="note-time">{{ note.time }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="user-menu-container">
              <div class="avatar" @click.stop="toggleUserMenu">
                <User class="avatar-icon" />
              </div>

              <div v-if="showUserMenu" class="user-dropdown">
                <div class="user-dropdown-item logout" @click="handleLogout">
                  <LogOut class="dropdown-item-icon" />
                  <span>退出登录</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <transition name="toast-fade">
      <div v-if="logoutToastVisible" class="logout-toast">{{ logoutToastText }}</div>
    </transition>
  </nav>
</template>

<style scoped>
.navbar {
  height: 60px;
  background: #ffffff;
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  position: sticky;
  top: 0;
  z-index: 100;
}

.navbar-container {
  max-width: var(--max-width);
  margin: 0 auto;
  height: 100%;
  padding: 0 var(--page-padding);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 48px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: var(--color-primary-dark);
  font-weight: 700;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.nav-menu {
  display: flex;
  gap: 32px;
}

.nav-menu a {
  font-size: 14px;
  color: #64748b;
  position: relative;
  padding-bottom: 16px;
  transition: color 0.2s;
  font-weight: 600;
}

.nav-menu a:hover {
  color: #0f172a;
}

.nav-menu a.active {
  color: var(--color-primary-dark);
  font-weight: 600;
}

.nav-menu a.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--color-primary);
  border-radius: 2px 2px 0 0;
}

.nav-right {
  display: flex;
  align-items: center;
}

.nav-link {
  font-size: 14px;
  color: #475569;
  transition: color 0.2s;
}

.nav-link:hover {
  color: var(--color-primary-dark);
}

.nav-link-with-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.text-badge {
  position: absolute;
  top: -8px;
  right: -20px;
  background-color: #dc2626;
  color: white;
  font-size: 11px;
  padding: 2px 5px;
  border-radius: 10px;
  line-height: 1;
  font-weight: bold;
}

.divider {
  color: #cbd5e1;
  margin: 0 8px;
}

.user-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  transition: color 0.2s;
}

.icon-btn:hover {
  color: var(--color-primary-dark);
}

.notification-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.badge {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  background-color: #ff3b30;
  border-radius: 50%;
  border: 1px solid #fff;
}

.nav-icon {
  width: 20px;
  height: 20px;
}

.notification-container {
  position: relative;
}

.notification-dropdown {
  position: absolute;
  top: 100%;
  right: -20px;
  width: 300px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
  border: 1px solid var(--color-border);
  margin-top: 16px;
  z-index: 200;
  overflow: hidden;
}

.notification-dropdown::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 30px;
  width: 12px;
  height: 12px;
  background: white;
  transform: rotate(45deg);
  border-left: 1px solid rgba(0,0,0,0.05);
  border-top: 1px solid rgba(0,0,0,0.05);
}

.dropdown-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: #f8fafc;
}

.dropdown-header h4 {
  margin: 0;
  font-size: 14px;
  color: #1d1d1f;
  font-weight: 600;
}

.dropdown-body {
  max-height: 360px;
  overflow-y: auto;
}

.note-item {
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  transition: background-color 0.2s;
}

.note-item:last-child {
  border-bottom: none;
}

.note-item:hover {
  background-color: #f8fafc;
}

.note-title {
  font-size: 14px;
  font-weight: 500;
  color: #1d1d1f;
  margin-bottom: 4px;
}

.note-content {
  font-size: 13px;
  color: #86868b;
  line-height: 1.4;
  margin-bottom: 8px;
}

.note-time {
  font-size: 11px;
  color: #a1a1a6;
}

.user-menu-container {
  position: relative;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #f8fafc;
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: all 0.2s;
  cursor: pointer;
}

.avatar:hover {
  border-color: var(--color-primary-light);
  color: var(--color-primary-dark);
}

.avatar-icon {
  width: 20px;
  height: 20px;
}

.user-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  width: 160px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.14);
  border: 1px solid var(--color-border);
  margin-top: 12px;
  z-index: 200;
  overflow: hidden;
  animation: dropdownFadeIn 0.15s ease;
}

@keyframes dropdownFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.user-dropdown::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 12px;
  width: 12px;
  height: 12px;
  background: white;
  transform: rotate(45deg);
  border-left: 1px solid rgba(0,0,0,0.05);
  border-top: 1px solid rgba(0,0,0,0.05);
}

.user-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #1d1d1f;
  cursor: pointer;
  transition: background 0.15s;
}

.user-dropdown-item:hover {
  background: #f8fafc;
}

.user-dropdown-item.logout {
  color: #FF3B30;
}

.user-dropdown-item.logout:hover {
  background: #FFF1F0;
}

.dropdown-item-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 768px) {
  .navbar-container {
    padding: 0 16px;
  }

  .nav-menu {
    display: none;
  }
}

.logout-toast {
  position: fixed;
  top: 76px;
  right: 24px;
  background: #111827;
  color: #fff;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  z-index: 999;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.18);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
