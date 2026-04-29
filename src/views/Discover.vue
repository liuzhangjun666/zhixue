<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessageCircle, Search, SlidersHorizontal, Star, ClipboardPlus, MapPin } from 'lucide-vue-next'
import { discoverApi, type DiscoverTeacherDTO } from '../api/discover'
import { AUTH_TOKEN_STORAGE_KEY } from '../api/http'
import { getStoredUser } from '../api/auth'

const router = useRouter()

const teachers = ref<DiscoverTeacherDTO[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 9
const loading = ref(false)
const feedback = ref('')

const filters = ref({
  keyword: '',
  subject: '',
  grade: '',
  city: '',
  mode: '',
  min_price: '',
  max_price: '',
  min_rating: '',
  sort: 'recommended'
})

const subjects = ['数学', '英语', '语文', '物理', '化学']
const grades = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三']
const cities = ['上海', '杭州', '北京', '广州', '深圳']

const currentUser = computed(() => getStoredUser())
const isLoggedIn = computed(() => {
  if (typeof window === 'undefined') return false
  return Boolean(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY))
})
const isParent = computed(() => currentUser.value?.role === 'parent')
const isTeacher = computed(() => currentUser.value?.role === 'teacher')
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const priceText = (item: DiscoverTeacherDTO) => {
  if (item.hourlyPriceMin == null && item.hourlyPriceMax == null) return '价格待沟通'
  if (item.hourlyPriceMin != null && item.hourlyPriceMax != null) return `${item.hourlyPriceMin}-${item.hourlyPriceMax} 元/小时`
  return `${item.hourlyPriceMin ?? item.hourlyPriceMax} 元/小时起`
}

const modeText = (mode: string) => {
  if (mode === 'online') return '线上'
  if (mode === 'offline') return '线下'
  return '线上/线下'
}

const loadTeachers = async () => {
  loading.value = true
  feedback.value = ''
  try {
    const result = await discoverApi.getTeachers({ ...filters.value, page: page.value, page_size: pageSize })
    teachers.value = result.list
    total.value = result.total
  } catch (error) {
    feedback.value = (error as Error).message || '老师列表加载失败'
  } finally {
    loading.value = false
  }
}

const search = () => {
  page.value = 1
  loadTeachers()
}

const clearFilters = () => {
  filters.value = {
    keyword: '',
    subject: '',
    grade: '',
    city: '',
    mode: '',
    min_price: '',
    max_price: '',
    min_rating: '',
    sort: 'recommended'
  }
  page.value = 1
  loadTeachers()
}

const goLogin = () => {
  router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
}

const goRequest = (teacher: DiscoverTeacherDTO) => {
  if (!isLoggedIn.value) return goLogin()
  if (!isParent.value) return
  router.push({
    path: '/parent/requests',
    query: {
      teacherId: String(teacher.teacherId),
      teacherName: teacher.name,
      subject: teacher.subjects[0] || '',
      from: 'discover'
    }
  })
}

const contact = async (teacher: DiscoverTeacherDTO) => {
  if (!isLoggedIn.value) return goLogin()
  if (!isParent.value) return
  feedback.value = ''
  try {
    const result = await discoverApi.contactTeacher(teacher.teacherId)
    router.push({ path: '/messages', query: { conversationId: String(result.conversationId) } })
  } catch (error) {
    feedback.value = (error as Error).message || '创建会话失败'
  }
}

const turnPage = (nextPage: number) => {
  page.value = Math.min(totalPages.value, Math.max(1, nextPage))
  loadTeachers()
}

onMounted(loadTeachers)
</script>

<template>
  <section class="discover-page">
    <header class="discover-header">
      <div>
        <p class="eyebrow">发现老师</p>
        <h1>按真实条件筛选同城老师</h1>
      </div>
      <div class="header-stat">
        <span>{{ total }}</span>
        <small>位可联系老师</small>
      </div>
    </header>

    <section class="filter-panel">
      <div class="search-row">
        <div class="search-box">
          <Search :size="18" />
          <input v-model="filters.keyword" type="search" placeholder="搜索老师、科目、城市" @keyup.enter="search" />
        </div>
        <select v-model="filters.sort" @change="search">
          <option value="recommended">推荐排序</option>
          <option value="latest">最近更新</option>
          <option value="rating_desc">评分最高</option>
          <option value="price_asc">价格从低到高</option>
          <option value="price_desc">价格从高到低</option>
        </select>
        <button class="btn-primary" @click="search">
          <SlidersHorizontal :size="16" />
          筛选
        </button>
      </div>

      <div class="filter-grid">
        <select v-model="filters.subject" @change="search">
          <option value="">全部科目</option>
          <option v-for="item in subjects" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model="filters.grade" @change="search">
          <option value="">全部年级</option>
          <option v-for="item in grades" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model="filters.city" @change="search">
          <option value="">全部城市</option>
          <option v-for="item in cities" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model="filters.mode" @change="search">
          <option value="">全部方式</option>
          <option value="online">线上</option>
          <option value="offline">线下</option>
          <option value="both">线上/线下</option>
        </select>
        <input v-model="filters.min_price" type="number" min="0" placeholder="最低价格" @keyup.enter="search" />
        <input v-model="filters.max_price" type="number" min="0" placeholder="最高价格" @keyup.enter="search" />
        <select v-model="filters.min_rating" @change="search">
          <option value="">不限评分</option>
          <option value="4.5">4.5 分以上</option>
          <option value="4">4.0 分以上</option>
        </select>
        <button class="btn-ghost" @click="clearFilters">清空筛选</button>
      </div>
    </section>

    <p v-if="feedback" class="feedback">{{ feedback }}</p>

    <div v-if="loading" class="status-box">正在加载老师...</div>

    <div v-else-if="teachers.length === 0" class="status-box">
      <h2>没有匹配结果</h2>
      <p>可以放宽科目、城市、价格或评分条件。</p>
      <button class="btn-primary" @click="clearFilters">清空筛选</button>
    </div>

    <div v-else class="teacher-grid">
      <article v-for="teacher in teachers" :key="teacher.teacherId" class="teacher-card">
        <div class="card-head">
          <div class="avatar">
            <img v-if="teacher.avatar" :src="teacher.avatar" alt="" />
            <span v-else>{{ teacher.name.slice(0, 1) }}</span>
          </div>
          <div class="teacher-main">
            <h2 @click="router.push(`/discover/teachers/${teacher.teacherId}`)">{{ teacher.name }}</h2>
            <p>
              <MapPin :size="14" />
              {{ teacher.city || '城市待补充' }}{{ teacher.district ? ` · ${teacher.district}` : '' }}
            </p>
          </div>
          <span v-if="teacher.verified" class="verify-badge">已认证</span>
        </div>

        <div class="metric-row">
          <span><Star :size="14" /> {{ teacher.ratingAvg || '暂无' }} / {{ teacher.ratingCount }} 条</span>
          <span>{{ teacher.experienceYears }} 年经验</span>
          <span>{{ modeText(teacher.teachingMode) }}</span>
        </div>

        <p class="intro">{{ teacher.intro || '老师暂未填写简介' }}</p>

        <div class="tag-row">
          <span v-for="item in teacher.subjects.slice(0, 3)" :key="item">{{ item }}</span>
          <span v-for="item in teacher.grades.slice(0, 2)" :key="item">{{ item }}</span>
        </div>

        <div class="card-foot">
          <strong>{{ priceText(teacher) }}</strong>
          <div class="actions">
            <button class="icon-btn" :disabled="isTeacher" title="发需求" @click="goRequest(teacher)">
              <ClipboardPlus :size="17" />
            </button>
            <button class="icon-btn primary" :disabled="isTeacher" title="发消息" @click="contact(teacher)">
              <MessageCircle :size="17" />
            </button>
          </div>
        </div>

        <p v-if="isTeacher" class="role-hint">当前为老师账号，家长侧操作不可用。</p>
      </article>
    </div>

    <footer v-if="!loading && totalPages > 1" class="pager">
      <button class="btn-ghost" :disabled="page <= 1" @click="turnPage(page - 1)">上一页</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button class="btn-ghost" :disabled="page >= totalPages" @click="turnPage(page + 1)">下一页</button>
    </footer>
  </section>
</template>

<style scoped>
.discover-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.discover-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 0 8px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #0f766e;
  font-size: 13px;
  font-weight: 700;
}

h1 {
  margin: 0;
  color: #111827;
  font-size: 30px;
  letter-spacing: 0;
}

.header-stat {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 12px 16px;
  min-width: 126px;
  text-align: right;
  background: #fff;
}

.header-stat span {
  display: block;
  color: #111827;
  font-size: 24px;
  font-weight: 800;
}

.header-stat small {
  color: #6b7280;
}

.filter-panel,
.status-box {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 170px 100px;
  gap: 10px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0 12px;
  background: #f9fafb;
}

input,
select {
  width: 100%;
  min-height: 42px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0 12px;
  background: #fff;
  color: #111827;
  font-size: 14px;
  box-sizing: border-box;
}

.search-box input {
  border: 0;
  background: transparent;
  padding: 0;
  outline: none;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.teacher-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.teacher-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 300px;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  background: #ecfeff;
  color: #0f766e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.teacher-main {
  min-width: 0;
  flex: 1;
}

.teacher-main h2 {
  margin: 0 0 5px;
  color: #111827;
  font-size: 18px;
  cursor: pointer;
}

.teacher-main p,
.metric-row span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.teacher-main p,
.intro,
.role-hint {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.verify-badge {
  align-self: flex-start;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 700;
}

.metric-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: #374151;
  font-size: 13px;
}

.intro {
  min-height: 42px;
}

.tag-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag-row span {
  border-radius: 999px;
  background: #f3f4f6;
  color: #374151;
  padding: 5px 9px;
  font-size: 12px;
}

.card-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-foot strong {
  color: #111827;
  font-size: 15px;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-primary,
.btn-ghost,
.icon-btn {
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-primary {
  background: #0f766e;
  color: #fff;
}

.btn-ghost {
  background: #f3f4f6;
  color: #111827;
  min-height: 42px;
  padding: 0 14px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  background: #f3f4f6;
  color: #111827;
}

.icon-btn.primary {
  background: #0f766e;
  color: #fff;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.feedback {
  margin: 0;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fef2f2;
  color: #b91c1c;
}

.status-box {
  text-align: center;
  color: #6b7280;
}

.status-box h2 {
  margin: 0 0 8px;
  color: #111827;
}

.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
}

@media (max-width: 980px) {
  .teacher-grid,
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .search-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .discover-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .teacher-grid,
  .filter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
