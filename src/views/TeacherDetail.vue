<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ClipboardPlus, MessageCircle, Star } from 'lucide-vue-next'
import { discoverApi, type DiscoverTeacherDTO } from '../api/discover'
import { AUTH_TOKEN_STORAGE_KEY } from '../api/http'
import { getStoredUser } from '../api/auth'

const route = useRoute()
const router = useRouter()
const teacherId = Number(route.params.teacherId || 0)

const teacher = ref<DiscoverTeacherDTO | null>(null)
const loading = ref(false)
const feedback = ref('')

const user = computed(() => getStoredUser())
const isLoggedIn = computed(() => {
  if (typeof window === 'undefined') return false
  return Boolean(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY))
})
const isParent = computed(() => user.value?.role === 'parent')
const isTeacher = computed(() => user.value?.role === 'teacher')

const modeText = computed(() => {
  const mode = teacher.value?.teachingMode
  if (mode === 'online') return '线上授课'
  if (mode === 'offline') return '线下授课'
  return '线上/线下均可'
})

const priceText = computed(() => {
  const item = teacher.value
  if (!item) return ''
  if (item.hourlyPriceMin == null && item.hourlyPriceMax == null) return '价格待沟通'
  if (item.hourlyPriceMin != null && item.hourlyPriceMax != null) return `${item.hourlyPriceMin}-${item.hourlyPriceMax} 元/小时`
  return `${item.hourlyPriceMin ?? item.hourlyPriceMax} 元/小时起`
})

const loginWithRedirect = () => {
  router.push({ path: '/login', query: { redirect: route.fullPath } })
}

const createRequest = () => {
  if (!teacher.value) return
  if (!isLoggedIn.value) return loginWithRedirect()
  if (!isParent.value) return
  router.push({
    path: '/parent/requests',
    query: {
      teacherId: String(teacher.value.teacherId),
      teacherName: teacher.value.name,
      subject: teacher.value.subjects[0] || '',
      from: 'discover'
    }
  })
}

const contact = async () => {
  if (!teacher.value) return
  if (!isLoggedIn.value) return loginWithRedirect()
  if (!isParent.value) return
  feedback.value = ''
  try {
    const result = await discoverApi.contactTeacher(teacher.value.teacherId)
    router.push({ path: '/messages', query: { conversationId: String(result.conversationId) } })
  } catch (error) {
    feedback.value = (error as Error).message || '创建会话失败'
  }
}

const loadDetail = async () => {
  if (!teacherId) {
    feedback.value = '无效的老师 ID'
    return
  }
  loading.value = true
  feedback.value = ''
  try {
    teacher.value = await discoverApi.getTeacherDetail(teacherId)
  } catch (error) {
    feedback.value = (error as Error).message || '老师详情加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadDetail)
</script>

<template>
  <section class="detail-page">
    <button class="btn-back" @click="router.push('/discover')">
      <ArrowLeft :size="18" />
      返回发现
    </button>

    <div v-if="loading" class="state-box">正在加载老师资料...</div>
    <div v-else-if="feedback" class="state-box error">{{ feedback }}</div>

    <template v-else-if="teacher">
      <header class="profile-head">
        <div class="avatar">
          <img v-if="teacher.avatar" :src="teacher.avatar" alt="" />
          <span v-else>{{ teacher.name.slice(0, 1) }}</span>
        </div>
        <div class="profile-main">
          <div class="title-row">
            <h1>{{ teacher.name }}</h1>
            <span v-if="teacher.verified" class="verify-badge">已认证</span>
          </div>
          <p>{{ teacher.city || '城市待补充' }}{{ teacher.district ? ` · ${teacher.district}` : '' }}</p>
          <div class="quick-metrics">
            <span><Star :size="15" /> {{ teacher.ratingAvg || '暂无评分' }} / {{ teacher.ratingCount }} 条评价</span>
            <span>{{ teacher.experienceYears }} 年经验</span>
            <span>{{ modeText }}</span>
            <span>{{ priceText }}</span>
          </div>
        </div>
        <div class="cta-box">
          <button class="btn-primary" :disabled="isTeacher" @click="contact">
            <MessageCircle :size="17" />
            发消息
          </button>
          <button class="btn-secondary" :disabled="isTeacher" @click="createRequest">
            <ClipboardPlus :size="17" />
            发需求
          </button>
          <p v-if="isTeacher">当前为老师账号，家长侧操作不可用。</p>
        </div>
      </header>

      <section class="info-grid">
        <article>
          <h2>核心资料</h2>
          <p>{{ teacher.intro || '老师暂未填写简介。' }}</p>
        </article>
        <article>
          <h2>可授课信息</h2>
          <dl>
            <div>
              <dt>科目</dt>
              <dd>{{ teacher.subjects.join('、') || '-' }}</dd>
            </div>
            <div>
              <dt>年级</dt>
              <dd>{{ teacher.grades.join('、') || '-' }}</dd>
            </div>
            <div>
              <dt>时间</dt>
              <dd>{{ teacher.availableTimeText || '-' }}</dd>
            </div>
            <div>
              <dt>方式</dt>
              <dd>{{ modeText }}</dd>
            </div>
          </dl>
        </article>
        <article>
          <h2>评价统计</h2>
          <dl>
            <div>
              <dt>平均评分</dt>
              <dd>{{ teacher.ratingAvg || '暂无' }}</dd>
            </div>
            <div>
              <dt>评价数量</dt>
              <dd>{{ teacher.ratingCount }}</dd>
            </div>
          </dl>
        </article>
      </section>
    </template>
  </section>
</template>

<style scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.btn-back {
  align-self: flex-start;
  border: 0;
  border-radius: 8px;
  background: #f3f4f6;
  color: #111827;
  min-height: 40px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 700;
}

.profile-head,
.info-grid article,
.state-box {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.profile-head {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 180px;
  gap: 18px;
  padding: 20px;
  align-items: start;
}

.avatar {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  background: #ecfeff;
  color: #0f766e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: 800;
  overflow: hidden;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  color: #111827;
  font-size: 28px;
  letter-spacing: 0;
}

h2 {
  color: #111827;
  font-size: 18px;
  margin-bottom: 12px;
}

.profile-main > p,
.info-grid p,
.cta-box p {
  color: #6b7280;
  line-height: 1.7;
}

.quick-metrics {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.quick-metrics span,
.verify-badge {
  border-radius: 999px;
  background: #f3f4f6;
  color: #374151;
  padding: 6px 10px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.verify-badge {
  background: #ecfdf5;
  color: #047857;
  font-weight: 700;
}

.cta-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-primary,
.btn-secondary {
  border: 0;
  border-radius: 8px;
  min-height: 42px;
  cursor: pointer;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-primary {
  background: #0f766e;
  color: #fff;
}

.btn-secondary {
  background: #f3f4f6;
  color: #111827;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.info-grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr 0.8fr;
  gap: 14px;
}

.info-grid article {
  padding: 18px;
}

dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

dl div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
}

dt {
  color: #6b7280;
}

dd {
  margin: 0;
  color: #111827;
}

.state-box {
  padding: 24px;
  text-align: center;
  color: #6b7280;
}

.state-box.error {
  color: #b91c1c;
}

@media (max-width: 860px) {
  .profile-head,
  .info-grid {
    grid-template-columns: 1fr;
  }

  .cta-box {
    max-width: 320px;
  }
}
</style>
