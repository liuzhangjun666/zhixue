<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Bell, User } from 'lucide-vue-next'

const route = useRoute()
const currentPath = computed(() => route.path)

// Hide login/register links if we are NOT on the login or register page.
const isLoggedIn = computed(() => !['/login', '/register', '/teacher-auth'].includes(route.path))
const userRole = computed(() => {
  if (route.path.startsWith('/teacher')) return 'teacher'
  return 'parent'
})

const unreadCount = ref(0) // 私信未读数
const showNotifications = ref(false)
const systemNotifications = ref([
  { id: 1, title: '系统通知', content: '欢迎使用知学空间，请完善您的个人资料。', time: '刚刚', read: false },
  { id: 2, title: '课程提醒', content: '您有一节试听课即将开始。', time: '2小时前', read: false }
])
const systemUnreadCount = computed(() => systemNotifications.value.filter(n => !n.read).length)

let pollInterval: any = null

const toggleSystemNotifications = () => {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) {
    systemNotifications.value.forEach(n => n.read = true)
  }
}

const closeNotifications = (e: Event) => {
  if (!(e.target as Element).closest('.notification-container')) {
    showNotifications.value = false
  }
}

const fetchUnreadCount = async () => {
  if (!isLoggedIn.value) return
  const userId = userRole.value === 'teacher' ? 2 : 1
  try {
    const res = await fetch(`http://localhost:8000/api/messages/unread-count?userId=${userId}`)
    const { data } = await res.json()
    if (data) {
      unreadCount.value = data.count
    }
  } catch(e) {}
}

onMounted(() => {
  fetchUnreadCount()
  pollInterval = setInterval(fetchUnreadCount, 3000)
  document.addEventListener('click', closeNotifications)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
  document.removeEventListener('click', closeNotifications)
})
</script>

<template>
  <nav class="navbar">
    <div class="navbar-container">
      <div class="nav-left">
        <div class="logo">
          <div class="logo-icon">🎓</div>
          <span class="logo-text">知学空间</span>
        </div>
        <ul class="nav-menu">
          <li><router-link to="/" :class="{ active: currentPath === '/' }">首页</router-link></li>
          <li><router-link to="#" class="disabled">发现</router-link></li>
          <li>
            <router-link :to="{ path: '/messages', query: { userId: userRole === 'teacher' ? '2' : '1' } }" class="nav-link-with-badge" :class="{ active: currentPath.includes('/messages') }">
              消息
              <span v-if="unreadCount > 0" class="text-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
            </router-link>
          </li>
          <li>
            <router-link 
              :to="userRole === 'teacher' ? '/teacher-center' : '/parent-center'"
              :class="{ active: currentPath.includes('-center') }"
            >
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
        </template>
        <template v-else>
          <div class="user-actions">
            <!-- 系统通知小铃铛 -->
            <div class="notification-container">
              <button class="icon-btn notification-btn" @click.stop="toggleSystemNotifications">
                <Bell class="nav-icon" />
                <span v-if="systemUnreadCount > 0" class="badge"></span>
              </button>
              
              <!-- 通知下拉面板 -->
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

            <div class="user-profile">
              <div class="avatar">
                <User class="avatar-icon" />
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.navbar {
  height: 60px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid #E5E5EA;
  position: sticky;
  top: 0;
  z-index: 100;
}

.navbar-container {
  max-width: var(--max-width);
  margin: 0 auto;
  height: 100%;
  padding: 0 48px;
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
  background: #1D1D1F;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: white;
}

.logo-text {
  font-size: 20px;
  font-weight: 600;
  color: #1D1D1F;
  letter-spacing: -0.01em;
}

.nav-menu {
  display: flex;
  gap: 32px;
}

.nav-menu a {
  font-size: 15px;
  color: #86868B;
  position: relative;
  padding-bottom: 18px;
  transition: color 0.2s;
  font-weight: 500;
}

.nav-menu a:hover {
  color: #1D1D1F;
}

.nav-menu a.active {
  color: #1D1D1F;
  font-weight: 600;
}

.nav-menu a.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: #1D1D1F;
  border-radius: 2px 2px 0 0;
}

.nav-menu a.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-right {
  display: flex;
  align-items: center;
}

.nav-link {
  font-size: 14px;
  color: #86868B;
  transition: color 0.2s;
}

.nav-link:hover {
  color: #1D1D1F;
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
  background-color: #ff3b30;
  color: white;
  font-size: 11px;
  padding: 2px 5px;
  border-radius: 10px;
  line-height: 1;
  font-weight: bold;
}

.divider {
  color: #E5E5EA;
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
  color: #86868B;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  transition: color 0.2s;
}

.icon-btn:hover {
  color: #1D1D1F;
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
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.1);
  border: 1px solid rgba(0,0,0,0.05);
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
  border-bottom: 1px solid rgba(0,0,0,0.05);
  background: #fbfbfd;
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
  border-bottom: 1px solid rgba(0,0,0,0.05);
  transition: background-color 0.2s;
}

.note-item:last-child {
  border-bottom: none;
}

.note-item:hover {
  background-color: #f5f5f7;
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

.user-profile {
  cursor: pointer;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #F5F5F7;
  border: 1px solid #E5E5EA;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #86868B;
  transition: all 0.2s;
}

.avatar:hover {
  border-color: #1D1D1F;
  color: #1D1D1F;
}

.avatar-icon {
  width: 20px;
  height: 20px;
}

@media (max-width: 768px) {
  .navbar-container {
    padding: 0 16px;
  }
  .nav-menu {
    display: none;
  }
}
</style>
