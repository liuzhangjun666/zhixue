<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { parentApi, type ParentRequestDTO, type RequestStatus } from '../../api/parent'
import Modal from '../../components/Modal.vue'

const router = useRouter()
const route = useRoute()

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'matching', label: '匹配中' },
  { key: 'scheduled', label: '已约课' },
  { key: 'completed', label: '已完成' }
] as const

const activeTab = ref<(typeof tabs)[number]['key']>('all')

const requests = ref<ParentRequestDTO[]>([])
const loading = ref(false)
const actioningId = ref<number | null>(null)
const feedback = ref('')

const showCreateModal = ref(false)
const isSubmitting = ref(false)
const newReq = ref({
  title: '',
  subject: '',
  grade: '',
  budget: '',
  schedule: '',
  description: '',
  teacherName: ''
})

const filteredRequests = computed(() => {
  if (activeTab.value === 'all') return requests.value
  return requests.value.filter((item) => item.status === activeTab.value)
})

const countByStatus = (status: RequestStatus) => requests.value.filter((item) => item.status === status).length

const statusTextMap: Record<RequestStatus, string> = {
  pending: '待处理',
  matching: '匹配中',
  scheduled: '已约课',
  completed: '已完成',
  cancelled: '已取消'
}

const statusClassMap: Record<RequestStatus, string> = {
  pending: 'status-pending',
  matching: 'status-matching',
  scheduled: 'status-scheduled',
  completed: 'status-completed',
  cancelled: 'status-cancelled'
}

const cancelRequest = async (id: number) => {
  const target = requests.value.find((item) => item.id === id)
  if (!target) return
  const previousStatus = target.status
  actioningId.value = id
  feedback.value = ''
  target.status = 'cancelled'
  try {
    await parentApi.updateRequestStatus(id, 'cancelled')
  } catch (error) {
    target.status = previousStatus
    feedback.value = (error as Error).message || '取消失败，请稍后重试。'
  } finally {
    actioningId.value = null
  }
}

const completeRequest = async (id: number) => {
  const target = requests.value.find((item) => item.id === id)
  if (!target) return
  const previousStatus = target.status
  actioningId.value = id
  feedback.value = ''
  target.status = 'completed'
  try {
    await parentApi.updateRequestStatus(id, 'completed')
  } catch (error) {
    target.status = previousStatus
    feedback.value = (error as Error).message || '操作失败，请稍后重试。'
  } finally {
    actioningId.value = null
  }
}

const loadRequests = async () => {
  loading.value = true
  feedback.value = ''
  try {
    requests.value = await parentApi.getRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '请求列表加载失败。'
  } finally {
    loading.value = false
  }
}

const submitNewRequest = async () => {
  if (!newReq.value.title.trim()) {
    feedback.value = '请输入需求标题'
    return
  }
  isSubmitting.value = true
  feedback.value = ''
  try {
    await parentApi.createRequest(newReq.value)
    showCreateModal.value = false
    newReq.value = { title: '', subject: '', grade: '', budget: '', schedule: '', description: '', teacherName: '' }
    loadRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '新建请求失败'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  if (route.query.from === 'discover') {
    const teacherName = typeof route.query.teacherName === 'string' ? route.query.teacherName : ''
    const subject = typeof route.query.subject === 'string' ? route.query.subject : ''
    newReq.value = {
      title: teacherName ? `预约${teacherName}的辅导` : '',
      subject,
      grade: '',
      budget: '',
      schedule: '',
      description: teacherName ? `来自发现页，意向老师：${teacherName}` : '',
      teacherName
    }
    showCreateModal.value = true
  }
  loadRequests()
})
</script>

<template>
  <section class="module-page">
    <header class="module-header">
      <div class="header-left">
        <button class="btn-icon-back" @click="router.push('/parent-center')">
          <ArrowLeft :size="20" />
        </button>
        <div>
          <h1>我的请求</h1>
          <p>管理家教需求，跟踪匹配、约课和完成状态。</p>
        </div>
      </div>
      <button class="btn-primary" @click="showCreateModal = true">新建请求</button>
    </header>

    <article class="empty-card" v-if="loading">
      <p>请求列表加载中...</p>
    </article>

    <div class="tabs" v-else>
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span class="tab-count" v-if="tab.key !== 'all'">
          {{ countByStatus(tab.key as RequestStatus) }}
        </span>
      </button>
    </div>

    <div class="request-list" v-if="!loading && filteredRequests.length > 0">
      <article class="request-card" v-for="item in filteredRequests" :key="item.id">
        <div class="card-head">
          <h2>{{ item.title }}</h2>
          <span class="status-tag" :class="statusClassMap[item.status]">{{ statusTextMap[item.status] }}</span>
        </div>

        <div class="meta-grid">
          <p><span>科目：</span>{{ item.subject }}</p>
          <p><span>年级：</span>{{ item.grade }}</p>
          <p><span>预算：</span>{{ item.budget }}</p>
          <p><span>时间：</span>{{ item.schedule }}</p>
          <p><span>创建：</span>{{ item.createdAt }}</p>
          <p><span>老师：</span>{{ item.teacherName || '待匹配' }}</p>
        </div>

        <div class="card-actions">
          <button class="btn-secondary" v-if="item.status === 'matching' || item.status === 'pending'" @click="cancelRequest(item.id)" :disabled="actioningId === item.id">
            取消请求
          </button>
          <button class="btn-secondary" v-if="item.status === 'scheduled'" @click="completeRequest(item.id)" :disabled="actioningId === item.id">
            标记完成
          </button>
          <button class="btn-ghost" @click="router.push(`/parent/requests/${item.id}`)">查看详情</button>
        </div>
      </article>
    </div>

    <article class="empty-card" v-else-if="!loading">
      <h3>当前筛选下暂无请求</h3>
      <p>可切换筛选标签或新建家教请求。</p>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>

    <!-- 新建请求弹窗 -->
    <Modal :show="showCreateModal" title="新建家教请求" @close="showCreateModal = false">
      <div class="form-grid">
        <label class="field">
          <span>需求标题</span>
          <input v-model="newReq.title" type="text" placeholder="例如：四年级数学专项提升" />
        </label>
        <label class="field">
          <span>辅导科目</span>
          <input v-model="newReq.subject" type="text" placeholder="例如：数学" />
        </label>
        <label class="field">
          <span>学生年级</span>
          <input v-model="newReq.grade" type="text" placeholder="例如：四年级" />
        </label>
        <label class="field">
          <span>可接受预算</span>
          <input v-model="newReq.budget" type="text" placeholder="例如：150-200 元/小时" />
        </label>
        <label class="field field-full">
          <span>期望时间</span>
          <input v-model="newReq.schedule" type="text" placeholder="例如：每周六下午 2:00-4:00" />
        </label>
        <label class="field field-full">
          <span>补充说明</span>
          <input v-model="newReq.description" type="text" placeholder="孩子情况、目标或意向老师" />
        </label>
      </div>
      <template #footer>
        <button class="btn-ghost" @click="showCreateModal = false">取消</button>
        <button class="btn-primary" @click="submitNewRequest" :disabled="isSubmitting">
          {{ isSubmitting ? '提交中...' : '确认新建' }}
        </button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.module-page {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.module-header,
.tabs,
.request-card,
.empty-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-icon-back {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F5F5F7;
  color: #1D1D1F;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon-back:hover {
  background: #E5E5EA;
  transform: translateX(-2px);
}

h1 {
  margin: 0 0 8px;
  color: #111827;
}

h2 {
  margin: 0;
  color: #111827;
  font-size: 20px;
}

p {
  margin: 0;
  color: #6b7280;
}

.btn-primary,
.btn-secondary,
.btn-ghost {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 600;
}

.btn-primary {
  background: linear-gradient(135deg, #5e5ce6, #4f46e5);
  color: #fff;
}

.btn-secondary {
  background: #111827;
  color: #fff;
}

.btn-ghost {
  background: #eef2ff;
  color: #4338ca;
}

.tabs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.tab-item {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tab-item.active {
  border-color: #5e5ce6;
  color: #5e5ce6;
  background: rgba(94, 92, 230, 0.1);
}

.tab-count {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
}

.request-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.status-tag {
  border-radius: 999px;
  font-size: 12px;
  padding: 4px 10px;
  font-weight: 600;
}

.status-pending {
  background: #fffbeb;
  color: #b45309;
}

.status-matching {
  background: #eef2ff;
  color: #4338ca;
}

.status-scheduled {
  background: #ecfdf5;
  color: #047857;
}

.status-completed {
  background: #f3f4f6;
  color: #374151;
}

.status-cancelled {
  background: #fef2f2;
  color: #b91c1c;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.meta-grid span {
  color: #111827;
}

.card-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
}

.empty-card h3 {
  margin: 0 0 8px;
  color: #111827;
}

.feedback {
  margin: 0;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 12px;
  padding: 12px;
}

@media (max-width: 900px) {
  .meta-grid {
    grid-template-columns: 1fr;
  }

  .card-actions {
    flex-wrap: wrap;
  }
}

/* 表单样式 */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field span {
  color: #6b7280;
  font-size: 13px;
}
.field-full {
  grid-column: 1 / -1;
}
input {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
input:focus {
  border-color: #5e5ce6;
  box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.12);
}
</style>
