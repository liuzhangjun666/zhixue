<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { teacherApi, type MatchStatus, type TeacherMatchDTO } from '../../api/teacher'

const loading = ref(false)
const actioningId = ref<number | null>(null)
const feedback = ref('')
const unlockedMap = reactive<Record<number, { phone: string; wechat: string; parentName: string }>>({})
const matches = ref<TeacherMatchDTO[]>([])
const tab = ref<'' | MatchStatus>('')

const filtered = computed(() => {
  if (!tab.value) return matches.value
  return matches.value.filter((item) => item.status === tab.value)
})

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    matches.value = await teacherApi.getMatches(tab.value || undefined)
  } catch (error) {
    feedback.value = (error as Error).message || '匹配池加载失败'
  } finally {
    loading.value = false
  }
}

const unlock = async (id: number, unlockType: 'phone' | 'wechat') => {
  actioningId.value = id
  feedback.value = ''
  try {
    const data = await teacherApi.unlockMatch(id, unlockType)
    unlockedMap[id] = { phone: data.phone, wechat: data.wechat, parentName: data.parentName }
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '解锁失败'
  } finally {
    actioningId.value = null
  }
}

const accept = async (id: number) => {
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.acceptMatch(id)
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '接受失败'
  } finally {
    actioningId.value = null
  }
}

const reject = async (id: number) => {
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.rejectMatch(id)
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '拒绝失败'
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
        <h1>匹配池</h1>
        <p>查看系统推荐需求，解锁联系方式后可快速跟进。</p>
      </div>
    </header>

    <article class="card tabs" v-if="!loading">
      <button :class="{ active: tab === '' }" @click="tab = ''; load()">全部</button>
      <button :class="{ active: tab === 'new' }" @click="tab = 'new'; load()">新推荐</button>
      <button :class="{ active: tab === 'unlocked' }" @click="tab = 'unlocked'; load()">已解锁</button>
      <button :class="{ active: tab === 'accepted' }" @click="tab = 'accepted'; load()">已接受</button>
    </article>

    <article class="card" v-if="loading">
      <p>匹配数据加载中...</p>
    </article>

    <div class="list" v-else-if="filtered.length > 0">
      <article class="card item" v-for="item in filtered" :key="item.id">
        <div class="top">
          <h2>{{ item.title }}</h2>
          <div class="tag-wrap">
            <span class="score">匹配分 {{ item.matchScore }}</span>
            <span class="status">{{ item.status }}</span>
          </div>
        </div>
        <div class="meta">
          <p><span>家长：</span>{{ item.parentName }}</p>
          <p><span>科目：</span>{{ item.subject }}</p>
          <p><span>年级：</span>{{ item.grade }}</p>
          <p><span>预算：</span>{{ item.budget }}</p>
          <p><span>时间：</span>{{ item.schedule }}</p>
        </div>

        <div class="contact" v-if="unlockedMap[item.id]">
          <div>手机号：{{ unlockedMap[item.id].phone }}</div>
          <div>微信号：{{ unlockedMap[item.id].wechat }}</div>
        </div>

        <div class="actions">
          <button class="btn" :disabled="actioningId === item.id" @click="unlock(item.id, 'phone')">
            {{ actioningId === item.id ? '处理中...' : '解锁手机号' }}
          </button>
          <button class="btn-ghost" :disabled="actioningId === item.id" @click="unlock(item.id, 'wechat')">解锁微信</button>
          <button class="btn-ghost" :disabled="actioningId === item.id" @click="accept(item.id)">接受需求</button>
          <button class="btn-danger" :disabled="actioningId === item.id" @click="reject(item.id)">拒绝</button>
        </div>
      </article>
    </div>

    <article class="card" v-else>
      <p>暂无推荐需求。</p>
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
.top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; }
.tag-wrap { display: inline-flex; gap: 8px; align-items: center; }
.score { border-radius: 999px; padding: 4px 10px; font-size: 12px; background: #ecfdf5; color: #047857; }
.status { border-radius: 999px; padding: 4px 10px; font-size: 12px; background: #eef2ff; color: #4338ca; }
.meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.meta p { margin: 0; color: #6b7280; font-size: 14px; }
.meta span { color: #111827; }
.contact { margin-top: 10px; padding: 10px; border-radius: 10px; background: #f0fdf4; color: #065f46; display: flex; gap: 16px; flex-wrap: wrap; }
.actions { margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
.btn, .btn-ghost, .btn-danger { border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 600; }
.btn { background: #10a881; color: #fff; }
.btn-ghost { background: #eef2ff; color: #4338ca; }
.btn-danger { background: #fee2e2; color: #b91c1c; }
.feedback { margin: 0; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px; }
@media (max-width: 900px) { .meta { grid-template-columns: 1fr; } }
</style>
