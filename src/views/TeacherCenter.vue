<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Edit3, ClipboardList, Star, BarChart3, Crown, Settings, ChevronRight, FileText, ListChecks, Bell } from 'lucide-vue-next'
import { teacherApi, type DashboardSummaryDTO, type TeacherInviteSummaryDTO, type TeacherMembershipStatusDTO, type TeacherProfileDTO } from '../api/teacher'

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
const summary = ref<DashboardSummaryDTO>({
  newMatchCount: 0,
  unlockedMatchCount: 0,
  processingRequestCount: 0,
  remainingUnlock: 0,
  integrityScore: 80,
  totalReviewCount: 0,
  totalUnlockCount: 0,
  totalViewCount: 0
})
const invite = ref<TeacherInviteSummaryDTO>({ inviteCode: '', totalInvited: 0, verifiedInvited: 0, extraMatchQuota: 0 })
const loading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const menuItems: MenuItem[] = [
  { title: '编辑资料', icon: Edit3, path: '/teacher-center/edit' },
  { title: '通知中心', icon: Bell, path: '/teacher-center/notifications' },
  { title: '收到的请求', icon: ClipboardList, path: '/teacher-center/requests' },
  { title: '我的评价', icon: Star, path: '/teacher-center/reviews' },
  { title: '数据中心', icon: BarChart3, path: '/teacher-center/analytics' },
  { title: '匹配问卷', icon: FileText, path: '/teacher-center/questionnaire' },
  { title: '匹配池', icon: ListChecks, path: '/teacher-center/match-pool' },
  { title: '解锁记录', icon: ClipboardList, path: '/teacher-center/unlock-records' },
  { title: '会员中心', icon: Crown, path: '/teacher-center/vip', highlight: true },
  { title: '账户设置', icon: Settings, path: '/teacher-center/settings' }
]

const rankName = computed(() => membership.value?.planName || '普通老师')

const loadData = async () => {
  loading.value = true
  try {
    const [profileData, membershipData, summaryData] = await Promise.all([
      teacherApi.getProfile(),
      teacherApi.getMembershipStatus(),
      teacherApi.getDashboardSummary()
    ])
    profile.value = profileData
    membership.value = membershipData
    summary.value = summaryData
    invite.value = await teacherApi.getInviteSummary()
  } catch (error) {
    console.error('Failed to load teacher center data:', error)
  } finally {
    loading.value = false
  }
}

const createInviteCode = async () => {
  try {
    const result = await teacherApi.createInviteCode()
    invite.value.inviteCode = String(result.inviteCode || '')
  } catch (error) {
    console.error('Failed to create invite code:', error)
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
            <p class="sub">诚信评分：{{ summary.integrityScore }}</p>
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
          <div>剩余解锁：{{ summary.remainingUnlock }} 次</div>
          <div>今日新推荐：{{ summary.newMatchCount }} 条</div>
          <div>处理中请求：{{ summary.processingRequestCount }} 条</div>
          <div>累计评价：{{ summary.totalReviewCount }} 条</div>
          <div>累计解锁：{{ summary.totalUnlockCount }} 次</div>
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

      <div class="teacher-card menu-card invite-card">
        <h3>邀请奖励</h3>
        <p class="invite-text">邀请1位新老师完成审核，可获得1次额外匹配机会。</p>
        <div class="invite-row">
          <span class="invite-code">{{ invite.inviteCode || '暂无邀请码' }}</span>
          <button class="btn-edit" @click="createInviteCode">生成邀请码</button>
        </div>
        <p class="invite-meta">已邀请 {{ invite.totalInvited }} 人，已完成审核 {{ invite.verifiedInvited }} 人，额外配额 {{ invite.extraMatchQuota }}</p>
      </div>
    </aside>

    <div class="teacher-content-area">
      <main class="teacher-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.teacher-center-layout {
  display: flex;
  gap: 24px;
  width: 100%;
  max-width: 1560px;
  margin: 0 auto;
  padding: 24px;
  align-items: flex-start;
  box-sizing: border-box;
}

.teacher-sidebar {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.teacher-main {
  flex: 1 1 auto;
  min-width: 0;
}

.teacher-content-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.invite-text {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.invite-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.invite-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #111827;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f3f4f6;
}

.invite-meta {
  margin: 10px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.invite-card {
  margin-top: 0;
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

.menu-icon {
  width: 18px;
  height: 18px;
}

.menu-arrow {
  width: 16px;
  height: 16px;
  color: #9ca3af;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1000px) {
  .teacher-center-layout {
    flex-direction: column;
    gap: 14px;
    padding: 12px 12px 92px;
  }

  .teacher-sidebar {
    width: 100%;
    order: 2;
    gap: 14px;
  }

  .teacher-content-area {
    order: 1;
    width: 100%;
  }

  .teacher-card,
  .membership-card {
    border-radius: 14px;
    padding: 16px;
  }

  .profile-row {
    gap: 12px;
  }

  .profile-meta h2 {
    font-size: 20px;
  }

  .membership-title {
    font-size: 18px;
  }

  .membership-benefits {
    font-size: 13px;
  }

  .menu-card h3 {
    font-size: 17px;
  }

  .menu-item {
    min-height: 46px;
    height: auto;
    padding: 10px 12px;
  }
}

@media (max-width: 560px) {
  .teacher-center-layout {
    padding: 10px 10px 92px;
  }

  .avatar {
    width: 60px;
    height: 60px;
  }

  .profile-meta h2 {
    font-size: 18px;
  }

  .profile-meta p {
    font-size: 12px;
  }

  .btn-edit {
    padding: 7px 12px;
    font-size: 13px;
  }

  .invite-row {
    flex-wrap: wrap;
  }
}

</style>
