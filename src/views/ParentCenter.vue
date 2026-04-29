<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Edit3, ClipboardList, Star, Crown, Settings, Bell } from 'lucide-vue-next'
import { parentApi, type ParentProfileDTO } from '../api/parent'

const router = useRouter()
const PARENT_AVATAR_CACHE_KEY = 'zhixue_parent_avatar_cache'

const userProfile = ref<ParentProfileDTO | null>(null)
const cachedAvatar = ref('')
const membershipStatus = ref({
  planName: '普通用户',
  expireAt: '-',
  remainingUnlock: 0
})
const requestCount = ref<number>(0)
const reviewCount = ref<number>(0)
const notificationCount = ref<number>(0)
const fileInput = ref<HTMLInputElement | null>(null)

const loadCachedAvatar = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(PARENT_AVATAR_CACHE_KEY) || ''
}

const persistCachedAvatar = (value: string) => {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(PARENT_AVATAR_CACHE_KEY)
    return
  }
  window.localStorage.setItem(PARENT_AVATAR_CACHE_KEY, value)
}

const avatarSrc = computed(() => userProfile.value?.avatar || cachedAvatar.value || '')

onMounted(async () => {
  cachedAvatar.value = loadCachedAvatar()
  try {
    userProfile.value = await parentApi.getProfile()
    if (userProfile.value?.avatar) {
      cachedAvatar.value = userProfile.value.avatar
      persistCachedAvatar(userProfile.value.avatar)
    }
  } catch(e) {
    console.error('Failed to load profile', e)
  }
  try {
    const requests = await parentApi.getRequests()
    requestCount.value = Array.isArray(requests) ? requests.length : 0
  } catch (e) {
    console.error('Failed to load request count', e)
  }
  try {
    const notifications = await parentApi.getNotifications()
    notificationCount.value = Array.isArray(notifications.matchUpdates) ? notifications.matchUpdates.length : 0
  } catch (e) {
    console.error('Failed to load notifications', e)
  }
  try {
    const [membership, reviews] = await Promise.all([parentApi.getMembershipStatus(), parentApi.getReviews()])
    membershipStatus.value = {
      planName: membership.planName || '普通用户',
      expireAt: membership.expireAt || '-',
      remainingUnlock: Number(membership.remainingUnlock || 0)
    }
    reviewCount.value = Array.isArray(reviews) ? reviews.length : 0
  } catch (e) {
    console.error('Failed to load membership/reviews', e)
  }
})

const triggerAvatarUpload = () => {
  fileInput.value?.click()
}

const onFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target?.result as string
    if (userProfile.value) {
      userProfile.value.avatar = base64
    }
    cachedAvatar.value = base64
    persistCachedAvatar(base64)
    try {
      await parentApi.uploadAvatar(base64)
    } catch(err) {
      console.error('Upload failed', err)
    }
  }
  reader.readAsDataURL(file)
}

interface MenuItem {
  title: string
  icon: any
  path: string
  badge?: number
  suffix?: string
  iconClass?: string
  textClass?: string
}

const menuItems = computed<MenuItem[]>(() => [
  { title: '编辑资料', icon: Edit3, path: '/parent/edit' },
  { title: '通知中心', icon: Bell, path: '/parent/notifications', badge: notificationCount.value > 0 ? notificationCount.value : undefined },
  { title: '我的请求', icon: ClipboardList, path: '/parent/requests', badge: requestCount.value > 0 ? requestCount.value : undefined },
  { title: '我的评价', icon: Star, path: '/parent/reviews', suffix: `共 ${reviewCount.value} 条` },
  {
    title: '会员中心',
    icon: Crown,
    path: '/parent/vip',
    iconClass: 'icon-primary',
    textClass: 'text-primary fw-bold'
  },
  { title: '账户设置', icon: Settings, path: '/parent/settings' }
])

const handleNavigate = (path: string) => {
  if (!path) return

  router.push(path).catch(() => {})
}
</script>

<template>
  <div class="apple-dashboard-layout">
    <!-- 顶部用户信息区 -->
    <div class="apple-card mb-4 w-full">
      <div class="user-profile">
        <div class="avatar-large" @click="triggerAvatarUpload" style="cursor: pointer;">
          <img v-if="avatarSrc" :src="avatarSrc" alt="avatar" />
          <div v-else class="avatar-placeholder">头像</div>
          <div class="avatar-hover-overlay">更换头像</div>
          <input type="file" ref="fileInput" accept="image/png, image/jpeg" style="display: none" @change="onFileChange" />
        </div>
        <div class="user-info">
          <h2 class="user-name">{{ userProfile?.parentName || '加载中...' }} <span class="badge-verified">已认证</span></h2>
          <div class="user-meta mt-1">
            <span>诚信评分：待完善</span>
            <span class="mx-2">|</span>
            <span>入驻时间：{{ userProfile?.createdAt || '-' }}</span>
          </div>
        </div>
        <button class="btn-ghost-edit" @click="handleNavigate('/parent/edit')">编辑资料</button>
      </div>
    </div>
    
    <!-- 核心功能区域：左侧 VIP，右侧菜单 -->
    <div class="dashboard-grid">
      <!-- 黑金会员卡片 -->
      <div class="dark-gold-vip-card h-full">
        <div class="vip-header">
          <div>
            <div class="vip-title"><Crown class="gold-icon" /> {{ membershipStatus.planName }}</div>
            <div class="vip-date">到期时间：{{ membershipStatus.expireAt || '-' }}</div>
          </div>
        </div>
        
        <div class="vip-footer">
          <div class="unlock-section">
            <div class="unlock-title">今日剩余解锁</div>
            <div class="unlock-count">{{ membershipStatus.remainingUnlock }} <span class="unlock-unit">次</span></div>
          </div>
          <button class="btn-gold-glass" @click="handleNavigate('/discover')">立即寻找老师</button>
        </div>
      </div>

      <!-- 功能入口网格 -->
      <div class="apple-card menu-card h-full">
        <h3 class="menu-title mb-3">功能菜单</h3>
        <div class="menu-grid">
          <div
            v-for="item in menuItems" 
            :key="item.title"
            class="menu-grid-item"
            @click="handleNavigate(item.path)"
          >
            <div class="menu-item-icon-wrapper" :class="item.iconClass">
              <component :is="item.icon" class="menu-item-icon" />
            </div>
            <span class="menu-item-title" :class="item.textClass">{{ item.title }}</span>
            <span v-if="item.badge" class="menu-item-badge">{{ item.badge }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* 强制整个应用背景为 #F5F5F7 */
body {
  background-color: #F5F5F7;
}
</style>

<style scoped>
.apple-dashboard-layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.w-full { width: 100%; }
.mx-2 { margin: 0 12px; }
.h-full { height: 100%; }

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  min-height: 400px;
}

/* 路由切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 基础卡片样式 */
.apple-card {
  background: #FFFFFF;
  border-radius: 20px;
  padding: 32px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
  border: 1px solid #E5E5EA;
}

.mb-4 { margin-bottom: 32px; }
.mt-1 { margin-top: 4px; }
.mt-3 { margin-top: 16px; }
.mb-3 { margin-bottom: 16px; }

/* 左侧信息 */
.user-profile {
  display: flex;
  align-items: center;
  gap: 24px;
  position: relative;
}

.avatar-large {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px solid #E5E5EA;
  overflow: hidden;
  background: #F5F5F7;
}

.avatar-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #9ca3af;
  background: #f5f5f7;
}

.user-name {
  font-size: 24px;
  font-weight: 600;
  color: #1D1D1F;
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.avatar-large {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px solid #E5E5EA;
  overflow: hidden;
  background: #F5F5F7;
  flex-shrink: 0;
}

.avatar-hover-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;
}

.avatar-large:hover .avatar-hover-overlay {
  opacity: 1;
}

.badge-verified {
  font-size: 12px;
  color: #5E5CE6;
  background: rgba(94, 92, 230, 0.1);
  padding: 4px 10px;
  border-radius: 100px;
  font-weight: 500;
}

.user-meta {
  font-size: 14px;
  color: #86868B;
}

.btn-ghost-edit {
  position: absolute;
  right: 0;
  top: 0;
  background: #F5F5F7;
  color: #1D1D1F;
  border: none;
  padding: 8px 16px;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-ghost-edit:hover {
  background: #E5E5EA;
}

/* 黑金 VIP 卡片重塑 */
.dark-gold-vip-card {
  background: linear-gradient(135deg, #2C2C2E 0%, #1A1A1A 100%);
  border-radius: 20px;
  padding: 32px;
  color: #F3E2C4;
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 48px;
  position: relative;
  overflow: hidden;
}

/* 添加微弱的高级反光效果 */
.dark-gold-vip-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(243, 226, 196, 0.05) 50%, rgba(255,255,255,0) 100%);
  transform: skewX(-25deg);
  animation: shimmer 8s infinite;
}

@keyframes shimmer {
  0% { left: -100%; }
  20% { left: 200%; }
  100% { left: 200%; }
}

.vip-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.vip-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #F3E2C4;
}

.gold-icon {
  width: 22px;
  height: 22px;
}

.vip-date {
  font-size: 14px;
  color: rgba(243, 226, 196, 0.6);
}

.vip-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.unlock-title {
  font-size: 14px;
  color: rgba(243, 226, 196, 0.8);
  margin-bottom: 4px;
}

.unlock-count {
  font-size: 40px;
  font-weight: 700;
  color: #F3E2C4;
  line-height: 1;
}

.unlock-unit {
  font-size: 16px;
  font-weight: 500;
  opacity: 0.8;
}

.btn-gold-glass {
  background: rgba(243, 226, 196, 0.15);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #F3E2C4;
  border: none;
  padding: 12px 24px;
  border-radius: 100px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-gold-glass:hover {
  background: rgba(243, 226, 196, 0.25);
  transform: translateY(-2px);
}

/* 右侧菜单 */
/* 功能入口网格 */
.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 20px;
  padding: 8px;
}

.menu-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: #F9F9FB;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  border: 1px solid transparent;
}

.menu-grid-item:hover {
  background: #FFFFFF;
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.06);
  border-color: #E5E5EA;
}

.menu-item-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  color: #86868B;
}

.menu-item-icon {
  width: 24px;
  height: 24px;
}

.menu-item-title {
  font-size: 15px;
  font-weight: 500;
  color: #1D1D1F;
}

.menu-item-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #FF3B30;
  color: white;
  font-size: 11px;
  font-weight: 600;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}

@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
</style>
