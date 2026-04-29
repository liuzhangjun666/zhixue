<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { teacherApi, type TeacherNotificationsDTO } from '../../api/teacher'

type NotificationTab = 'unlock' | 'match' | 'review' | 'complaint' | 'system'

const loading = ref(false)
const actioningId = ref<number | null>(null)
const feedback = ref('')
const tab = ref<NotificationTab>('unlock')

const data = ref<TeacherNotificationsDTO>({
  unlockRequests: [],
  matchUpdates: [],
  reviewNotices: [],
  complaintNotices: [],
  systemNotices: []
})

const appealDraft = reactive<Record<number, string>>({})

const activeList = computed<any[]>(() => {
  if (tab.value === 'unlock') return data.value.unlockRequests
  if (tab.value === 'match') return data.value.matchUpdates
  if (tab.value === 'review') return data.value.reviewNotices
  if (tab.value === 'complaint') return data.value.complaintNotices
  return data.value.systemNotices
})

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    data.value = await teacherApi.getNotifications()
  } catch (error) {
    feedback.value = (error as Error).message || '通知加载失败'
  } finally {
    loading.value = false
  }
}

const acceptUnlock = async (id: number) => {
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.acceptUnlockRequest(id)
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '同意失败'
  } finally {
    actioningId.value = null
  }
}

const rejectUnlock = async (id: number) => {
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.rejectUnlockRequest(id)
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '拒绝失败'
  } finally {
    actioningId.value = null
  }
}

const submitAppeal = async (id: number) => {
  const content = String(appealDraft[id] || '').trim()
  if (content.length < 10) {
    feedback.value = '申诉内容至少10个字'
    return
  }
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.submitComplaintAppeal(id, content)
    appealDraft[id] = ''
    feedback.value = '申诉已提交，等待平台复核'
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '申诉提交失败'
  } finally {
    actioningId.value = null
  }
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="card header">
      <div>
        <h1>通知中心</h1>
        <p>统一处理解锁请求、匹配进度、评价反馈、被投诉通知和平台公告。</p>
      </div>
    </header>

    <article class="card tabs" v-if="!loading">
      <button :class="{ active: tab === 'unlock' }" @click="tab = 'unlock'">解锁请求</button>
      <button :class="{ active: tab === 'match' }" @click="tab = 'match'">匹配进度</button>
      <button :class="{ active: tab === 'review' }" @click="tab = 'review'">评价通知</button>
      <button :class="{ active: tab === 'complaint' }" @click="tab = 'complaint'">被投诉通知</button>
      <button :class="{ active: tab === 'system' }" @click="tab = 'system'">系统公告</button>
    </article>

    <article class="card" v-if="loading">
      <p>通知加载中...</p>
    </article>

    <div class="list" v-else-if="activeList.length">
      <article class="card item" v-for="item in activeList" :key="item.id">
        <div class="top">
          <h2>{{ item.title }}</h2>
          <span class="time">{{ item.createdAt?.slice(0, 16).replace('T', ' ') }}</span>
        </div>

        <template v-if="tab === 'unlock'">
          <p class="desc">{{ item.parentName }} 发起了解锁请求：{{ item.subject }} / {{ item.grade }} / 预算 {{ item.budget }}</p>
          <div class="actions">
            <button class="btn" :disabled="actioningId === item.id" @click="acceptUnlock(item.id)">{{ actioningId === item.id ? '处理中...' : '同意' }}</button>
            <button class="btn-danger" :disabled="actioningId === item.id" @click="rejectUnlock(item.id)">拒绝</button>
          </div>
        </template>

        <template v-else-if="tab === 'complaint'">
          <p class="desc">{{ item.content }}</p>
          <p class="desc muted">状态：{{ item.status }}<span v-if="item.result"> ｜处理结果：{{ item.result }}</span></p>
          <p class="desc muted" v-if="item.hasAppealed">申诉状态：{{ item.appealStatus }}</p>
          <div v-if="item.appealable" class="appeal-box">
            <textarea v-model="appealDraft[item.id]" rows="3" placeholder="填写申诉说明（至少10字）"></textarea>
            <button class="btn" :disabled="actioningId === item.id" @click="submitAppeal(item.id)">{{ actioningId === item.id ? '提交中...' : '提交申诉' }}</button>
          </div>
        </template>

        <template v-else>
          <p class="desc">{{ item.content }}</p>
        </template>
      </article>
    </div>

    <article class="card" v-else>
      <p>当前暂无通知。</p>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
.header h1 { margin: 0 0 8px; color: #111827; }
.header p { margin: 0; color: #6b7280; }
.tabs { display: flex; gap: 10px; flex-wrap: wrap; }
.tabs button { border: 1px solid #d1d5db; border-radius: 999px; background: #fff; padding: 8px 12px; cursor: pointer; }
.tabs button.active { border-color: #10a881; color: #047857; background: rgba(16, 168, 129, 0.12); }
.list { display: flex; flex-direction: column; gap: 12px; }
.item h2 { margin: 0; font-size: 18px; color: #111827; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.time { color: #9ca3af; font-size: 12px; }
.desc { margin: 10px 0 0; color: #4b5563; }
.desc.muted { color: #6b7280; font-size: 13px; }
.actions { margin-top: 12px; display: flex; gap: 10px; }
.appeal-box { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.appeal-box textarea { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; }
.appeal-box textarea:focus { border-color: #10a881; box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.12); }
.btn, .btn-danger { border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 600; }
.btn { background: #10a881; color: #fff; }
.btn-danger { background: #fee2e2; color: #b91c1c; }
.feedback { margin: 0; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px; }
</style>
