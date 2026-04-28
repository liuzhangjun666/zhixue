<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Edit3, ClipboardList, Star, BarChart3, Crown, Settings, ChevronRight } from 'lucide-vue-next'
import { teacherApi, type TeacherMembershipStatusDTO, type TeacherProfileDTO } from '../api/teacher'

interface MenuItem {
  title: string
  icon: any
  path: string
  highlight?: boolean
}

const route = useRoute()
const router = useRouter()

const profile = ref<TeacherProfileDTO | null>(null)
const membership = ref<TeacherMembershipStatusDTO | null>(null)
const loading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const menuItems: MenuItem[] = [
  { title: '编辑资料', icon: Edit3, path: '/teacher-center/edit' },
  { title: '收到的请求', icon: ClipboardList, path: '/teacher-center/requests' },
  { title: '我的评价', icon: Star, path: '/teacher-center/reviews' },
  { title: '数据中心', icon: BarChart3, path: '/teacher-center/analytics' },
  { title: '会员中心', icon: Crown, path: '/teacher-center/vip', highlight: true },
  { title: '账户设置', icon: Settings, path: '/teacher-center/settings' }
]

const rankName = computed(() => membership.value?.planName || '普通老师')

const loadData = async () => {
  loading.value = true
  try {
    const [profileData, membershipData] = await Promise.all([teacherApi.getProfile(), teacherApi.getMembershipStatus()])
    profile.value = profileData
    membership.value = membershipData
  } catch (error) {
    console.error('Failed to load teacher center data:', error)
  } finally {
    loading.value = false
  }
}

const triggerAvatarUpload = () => {
  fileInput.value?.click()
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target?.result as string
    if (!base64) return
    if (profile.value) {
      profile.value.avatar = base64
    }
    try {
      await teacherApi.uploadAvatar(base64)
    } catch (error) {
      console.error('Failed to upload avatar:', error)
    }
  }
  reader.readAsDataURL(file)
}

const navigateTo = (path: string) => {
  if (!path) return
  router.push(path).catch(() => {})
}

onMounted(loadData)
</script>

<template>
  <div class="teacher-center-layout container">
    <aside class="teacher-sidebar">
      <div class="teacher-card">
        <div class="profile-row">
          <div class="avatar" @click="triggerAvatarUpload">
            <img :src="profile?.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=Teacher'" alt="avatar" />
            <div class="avatar-overlay">更换头像</div>
            <input ref="fileInput" type="file" accept="image/png, image/jpeg" class="hidden-input" @change="onFileChange" />
          </div>
          <div class="profile-meta">
            <h2>{{ profile?.teacherName || (loading ? '加载中...' : '老师') }}</h2>
            <p>{{ profile?.city || '所在城市未设置' }}</p>
            <p class="sub">诚信评分：4.9</p>
          </div>
          <button class="btn-edit" @click="navigateTo('/teacher-center/edit')">编辑</button>
        </div>
      </div>

      <div class="membership-card">
        <div>
          <div class="membership-title">{{ rankName }}</div>
          <div class="membership-expire">到期：{{ membership?.expireAt || '未开通' }}</div>
        </div>
        <div class="membership-benefits">
          <div>本周优先配额：{{ membership?.weeklyPriorityQuota ?? 0 }} 次</div>
          <div>剩余解锁：{{ membership?.remainingUnlock ?? 0 }} 次</div>
        </div>
        <button class="btn-membership" @click="navigateTo('/teacher-center/vip')">提升曝光</button>
      </div>

      <div class="teacher-card menu-card">
        <h3>常用功能</h3>
        <ul>
          <li v-for="item in menuItems" :key="item.path">
            <button class="menu-item" :class="{ active: route.path === item.path, highlight: item.highlight }" @click="navigateTo(item.path)">
              <span class="menu-left">
                <component :is="item.icon" class="menu-icon" />
                <span>{{ item.title }}</span>
              </span>
              <ChevronRight class="menu-arrow" />
            </button>
          </li>
        </ul>
      </div>
    </aside>

    <main class="teacher-main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
.teacher-center-layout {
  display: flex;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  align-items: flex-start;
}

.teacher-sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.teacher-main {
  flex: 1;
  min-width: 0;
}

.teacher-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  padding: 24px;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid #d1d5db;
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.avatar:hover .avatar-overlay {
  opacity: 1;
}

.hidden-input {
  display: none;
}

.profile-meta h2 {
  margin: 0;
  font-size: 22px;
  color: #111827;
}

.profile-meta p {
  margin-top: 4px;
  color: #6b7280;
  font-size: 13px;
}

.profile-meta .sub {
  color: #10a881;
}

.btn-edit {
  margin-left: auto;
  border: none;
  border-radius: 999px;
  background: #f3f4f6;
  color: #111827;
  padding: 8px 14px;
  cursor: pointer;
}

.membership-card {
  border-radius: 20px;
  padding: 24px;
  background: linear-gradient(135deg, #10a881 0%, #059669 100%);
  color: #fff;
  box-shadow: 0 12px 30px -12px rgba(16, 168, 129, 0.45);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.membership-title {
  font-size: 20px;
  font-weight: 700;
}

.membership-expire {
  font-size: 13px;
  opacity: 0.86;
  margin-top: 2px;
}

.membership-benefits {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}

.btn-membership {
  margin-top: 4px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
}

.menu-card h3 {
  margin: 0 0 8px;
  color: #111827;
  font-size: 18px;
}

.menu-item {
  width: 100%;
  border: none;
  background: transparent;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  cursor: pointer;
  color: #111827;
}

.menu-item:hover {
  background: #f3f4f6;
}

.menu-item.active {
  background: rgba(16, 168, 129, 0.12);
  color: #047857;
}

.menu-item.highlight {
  font-weight: 700;
}

.menu-left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.menu-icon,
.menu-arrow {
  width: 18px;
  height: 18px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 992px) {
  .teacher-center-layout {
    flex-direction: column;
  }

  .teacher-sidebar {
    width: 100%;
  }
}
</style>

