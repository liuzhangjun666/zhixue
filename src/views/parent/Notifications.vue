<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { parentApi, type ParentNotificationsDTO } from '../../api/parent'

const router = useRouter()
const loading = ref(false)
const feedback = ref('')
const tab = ref<'match' | 'system'>('match')

const data = ref<ParentNotificationsDTO>({
  matchUpdates: [],
  systemNotices: []
})

const activeList = computed(() => (tab.value === 'match' ? data.value.matchUpdates : data.value.systemNotices))

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    data.value = await parentApi.getNotifications()
  } catch (error) {
    feedback.value = (error as Error).message || '通知加载失败'
  } finally {
    loading.value = false
  }
}

const openMatch = (item: { requestId?: number; matchId?: number }) => {
  const requestId = Number(item?.requestId || 0)
  if (requestId > 0) {
    router.push(`/parent/requests/${requestId}`)
    return
  }
  router.push('/parent/requests')
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="card header">
      <div class="head-left">
        <button class="btn-back" @click="router.push('/parent-center')">
          <ArrowLeft :size="18" />
        </button>
        <div>
          <h1>通知中心</h1>
          <p>查看 Flip 匹配更新并快速进入需求详情。</p>
        </div>
      </div>
    </header>

    <article class="card tabs" v-if="!loading">
      <button :class="{ active: tab === 'match' }" @click="tab = 'match'">匹配更新</button>
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
        <p class="desc">{{ item.content }}</p>
        <button v-if="tab === 'match'" class="btn" @click="openMatch(item)">查看详情</button>
      </article>
    </div>

    <article class="card" v-else>
      <p>当前暂无通知。</p>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; max-width: 1100px; margin: 0 auto; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
.head-left { display: flex; align-items: center; gap: 12px; }
.btn-back { width: 36px; height: 36px; border: none; border-radius: 999px; background: #f3f4f6; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.header h1 { margin: 0 0 8px; color: #111827; }
.header p { margin: 0; color: #6b7280; }
.tabs { display: flex; gap: 10px; flex-wrap: wrap; }
.tabs button { border: 1px solid #d1d5db; border-radius: 999px; background: #fff; padding: 8px 12px; cursor: pointer; }
.tabs button.active { border-color: #4f46e5; color: #4338ca; background: rgba(67, 56, 202, 0.08); }
.list { display: flex; flex-direction: column; gap: 12px; }
.item h2 { margin: 0; font-size: 18px; color: #111827; }
.top { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.time { color: #9ca3af; font-size: 12px; }
.desc { margin: 10px 0; color: #4b5563; }
.btn { border: none; border-radius: 10px; background: #4f46e5; color: #fff; padding: 9px 12px; cursor: pointer; font-weight: 600; }
.feedback { margin: 0; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px; }
</style>
