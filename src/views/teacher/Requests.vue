<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { teacherApi, type TeacherRequestDTO } from '../../api/teacher'

const loading = ref(false)
const actioningId = ref<number | null>(null)
const feedback = ref('')
const requests = ref<TeacherRequestDTO[]>([])
const tab = ref<'all' | 'mine' | 'pool'>('all')

const filtered = computed(() => {
  if (tab.value === 'mine') return requests.value.filter((item) => item.isMine)
  if (tab.value === 'pool') return requests.value.filter((item) => !item.isMine)
  return requests.value
})

const statusLabel: Record<string, string> = {
  pending: '待处理',
  matching: '匹配中',
  scheduled: '已约课',
  completed: '已完成',
  cancelled: '已取消'
}

const loadRequests = async () => {
  loading.value = true
  feedback.value = ''
  try {
    requests.value = await teacherApi.getRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '请求列表加载失败'
  } finally {
    loading.value = false
  }
}

const accept = async (id: number) => {
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.acceptRequest(id)
    await loadRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '接单失败'
  } finally {
    actioningId.value = null
  }
}

const release = async (id: number) => {
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.releaseRequest(id)
    await loadRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '释放失败'
  } finally {
    actioningId.value = null
  }
}

const markCompleted = async (id: number) => {
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.updateRequestStatus(id, 'completed')
    await loadRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '更新状态失败'
  } finally {
    actioningId.value = null
  }
}

onMounted(loadRequests)
</script>

<template>
  <section class="page">
    <header class="card header">
      <div>
        <h1>收到的请求</h1>
        <p>处理匹配池中的需求，及时响应可提升后续曝光。</p>
      </div>
    </header>

    <article class="card tabs" v-if="!loading">
      <button :class="{ active: tab === 'all' }" @click="tab = 'all'">全部</button>
      <button :class="{ active: tab === 'mine' }" @click="tab = 'mine'">我已接单</button>
      <button :class="{ active: tab === 'pool' }" @click="tab = 'pool'">可接单池</button>
    </article>

    <article class="card" v-if="loading">
      <p>请求加载中...</p>
    </article>

    <div class="list" v-else-if="filtered.length > 0">
      <article class="card item" v-for="item in filtered" :key="item.id">
        <div class="top">
          <h2>{{ item.title }}</h2>
          <span class="status">{{ statusLabel[item.status] || item.status }}</span>
        </div>
        <div class="meta">
          <p><span>家长：</span>{{ item.parentName }}</p>
          <p><span>科目：</span>{{ item.subject }}</p>
          <p><span>年级：</span>{{ item.grade }}</p>
          <p><span>预算：</span>{{ item.budget }}</p>
          <p><span>时间：</span>{{ item.schedule }}</p>
          <p><span>发布时间：</span>{{ item.createdAt }}</p>
        </div>

        <div class="actions">
          <button class="btn" v-if="!item.isMine && (item.status === 'pending' || item.status === 'matching')" :disabled="actioningId === item.id" @click="accept(item.id)">
            {{ actioningId === item.id ? '处理中...' : '接单' }}
          </button>
          <button class="btn-ghost" v-if="item.isMine && item.status !== 'completed'" :disabled="actioningId === item.id" @click="markCompleted(item.id)">
            标记完成
          </button>
          <button class="btn-danger" v-if="item.isMine && item.status !== 'completed'" :disabled="actioningId === item.id" @click="release(item.id)">
            放回匹配池
          </button>
        </div>
      </article>
    </div>

    <article class="card" v-else>
      <p>当前暂无匹配请求。</p>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
.header h1 { margin: 0 0 8px; color: #111827; }
.header p { margin: 0; color: #6b7280; }
.tabs { display: flex; gap: 10px; }
.tabs button { border: 1px solid #d1d5db; border-radius: 999px; background: #fff; padding: 8px 12px; cursor: pointer; }
.tabs button.active { border-color: #10a881; color: #047857; background: rgba(16, 168, 129, 0.12); }
.list { display: flex; flex-direction: column; gap: 12px; }
.item h2 { margin: 0; font-size: 18px; color: #111827; }
.top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.status { border-radius: 999px; padding: 4px 10px; font-size: 12px; background: #ecfdf5; color: #047857; }
.meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.meta p { margin: 0; color: #6b7280; font-size: 14px; }
.meta span { color: #111827; }
.actions { margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
.btn, .btn-ghost, .btn-danger { border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 600; }
.btn { background: #10a881; color: #fff; }
.btn-ghost { background: #eef2ff; color: #4338ca; }
.btn-danger { background: #fee2e2; color: #b91c1c; }
.feedback { margin: 0; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px; }
@media (max-width: 900px) { .meta { grid-template-columns: 1fr; } }
</style>

