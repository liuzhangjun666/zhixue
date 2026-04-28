<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Edit3, ClipboardList, Star, Crown, Settings, ChevronRight } from 'lucide-vue-next'
import { parentApi, type ParentProfileDTO } from '../api/parent'

const router = useRouter()
const route = useRoute()
const showVipModal = ref<boolean>(false)

const userProfile = ref<ParentProfileDTO | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  try {
    userProfile.value = await parentApi.getProfile()
  } catch(e) {
    console.error('Failed to load profile', e)
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

const menuItems: MenuItem[] = [
  { title: '编辑资料', icon: Edit3, path: '/parent-center/edit' },
  { title: '我的请求', icon: ClipboardList, path: '/parent-center/requests', badge: 2 },
  { title: '我的评价', icon: Star, path: '/parent-center/reviews', suffix: '共 12 条' },
  {
    title: '会员中心',
    icon: Crown,
    path: '/parent-center/vip',
    iconClass: 'icon-primary',
    textClass: 'text-primary fw-bold'
  },
  { title: '账户设置', icon: Settings, path: '/parent-center/settings' }
]

const handleNavigate = (path: string) => {
  if (!path) return

  router.push(path).catch(() => {})
}
</script>

<template>
  <div class="apple-dashboard-layout container">
    <aside class="sidebar">
      <!-- 用户信息卡片 -->
      <div class="apple-card mb-4">
        <div class="user-profile">
          <div class="avatar-large" @click="triggerAvatarUpload" style="cursor: pointer;">
            <img :src="userProfile?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'" alt="avatar" />
            <div class="avatar-hover-overlay">更换头像</div>
            <input type="file" ref="fileInput" accept="image/png, image/jpeg" style="display: none" @change="onFileChange" />
          </div>
          <div class="user-info">
            <h2 class="user-name">{{ userProfile?.parentName || '加载中...' }} <span class="badge-verified">已认证</span></h2>
            <div class="user-meta mt-1">
              <span>诚信评分：4.9</span>
            </div>
            <div class="user-meta mt-1">
              <span>入驻时间：2025-01-10</span>
            </div>
          </div>
          <button class="btn-ghost-edit" @click="handleNavigate('/parent-center/edit')">编辑</button>
        </div>
      </div>
      
      <!-- 黑金会员卡片 -->
      <div class="dark-gold-vip-card mb-4">
        <div class="vip-header">
          <div>
            <div class="vip-title"><Crown class="gold-icon" /> 粉钻会员</div>
            <div class="vip-date">到期时间：2026-05-15</div>
          </div>
        </div>
        
        <div class="vip-footer">
          <div class="unlock-section">
            <div class="unlock-title">今日剩余解锁</div>
            <div class="unlock-count">5 <span class="unlock-unit">次</span></div>
          </div>
          <button class="btn-gold-glass" @click="showVipModal = true">立即寻找老师</button>
        </div>
      </div>

      <!-- 功能菜单 -->
      <div class="apple-card menu-card">
        <h3 class="menu-title mb-3">功能菜单</h3>
        <ul class="menu-list">
          <li
            v-for="item in menuItems" 
            :key="item.title"
          >
            <button
              type="button"
              class="menu-item"
              :class="{ active: route.path === item.path }"
              @click="handleNavigate(item.path)"
            >
              <div class="menu-left">
                <component :is="item.icon" class="menu-icon" :class="item.iconClass" />
                <span :class="item.textClass">{{ item.title }}</span>
              </div>

              <div class="menu-right" v-if="item.badge || item.suffix">
                <span v-if="item.badge" class="badge-red-smooth">{{ item.badge }}</span>
                <span v-if="item.suffix" class="text-meta">{{ item.suffix }}</span>
                <ChevronRight class="chevron-icon" :class="item.iconClass" />
              </div>
              <ChevronRight v-else class="chevron-icon" :class="item.iconClass" />
            </button>
          </li>
        </ul>
      </div>
    </aside>

    <main class="main-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
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
  justify-content: center;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  align-items: flex-start;
}

.sidebar {
  display: flex;
  flex-direction: column;
  width: 320px;
  flex-shrink: 0;
}

.main-content {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
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
.menu-card {
  padding: 24px 16px;
}

.menu-title {
  font-size: 18px;
  font-weight: 600;
  color: #1D1D1F;
  padding: 0 16px;
}

.menu-list {
  display: flex;
  flex-direction: column;
  list-style: none;
  padding: 0;
  margin: 0;
}

.menu-item {
  display: flex;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  padding: 0 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  transform-origin: center;
}

.menu-item:hover {
  background: #F3F4F6;
}

.menu-item:active {
  transform: scale(0.98);
}

.menu-item.active {
  background: rgba(94, 92, 230, 0.08); /* 极淡的紫灰色 */
}

.menu-item.active .menu-icon,
.menu-item.active .chevron-icon,
.menu-item.active span:not(.badge-red-smooth):not(.text-meta) {
  color: #5E5CE6 !important;
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #1D1D1F;
  font-weight: 500;
}

.menu-icon {
  width: 20px;
  height: 20px;
  color: #6B7280;
}

.chevron-icon {
  width: 18px;
  height: 18px;
  color: #9CA3AF;
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-meta {
  font-size: 14px;
  color: #86868B;
}

.icon-primary {
  color: #5E5CE6 !important;
}

.text-primary {
  color: #5E5CE6;
}

.fw-bold {
  font-weight: 600;
}

.badge-red-smooth {
  background: #FF3B30;
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  min-width: 24px;
  text-align: center;
}

@media (max-width: 992px) {
  .apple-dashboard-layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
  }
}
</style>
