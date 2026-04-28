<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { teacherApi, type TeacherAnalyticsDTO } from '../../api/teacher'

const loading = ref(false)
const feedback = ref('')
const analytics = ref<TeacherAnalyticsDTO | null>(null)

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    analytics.value = await teacherApi.getAnalytics()
  } catch (error) {
    feedback.value = (error as Error).message || '数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="card">
      <h1>数据中心</h1>
      <p>关注曝光、响应和转化，持续优化接单效率。</p>
    </header>

    <article class="card" v-if="loading">
      <p>数据加载中...</p>
    </article>

    <div v-else-if="analytics" class="grid">
      <article class="card metric">
        <span>本周浏览</span>
        <strong>{{ analytics.weeklyViews }}</strong>
      </article>
      <article class="card metric">
        <span>历史浏览</span>
        <strong>{{ analytics.totalViews }}</strong>
      </article>
      <article class="card metric">
        <span>待处理请求</span>
        <strong>{{ analytics.pendingRequests }}</strong>
      </article>
      <article class="card metric">
        <span>已约课</span>
        <strong>{{ analytics.scheduledRequests }}</strong>
      </article>
      <article class="card metric">
        <span>已完成请求</span>
        <strong>{{ analytics.completedRequests }}</strong>
      </article>
      <article class="card metric">
        <span>响应率</span>
        <strong>{{ Math.round(analytics.responseRate * 100) }}%</strong>
      </article>
      <article class="card metric wide">
        <span>评价统计</span>
        <strong>{{ analytics.averageRating.toFixed(1) }} 分 / {{ analytics.totalReviews }} 条评价</strong>
      </article>
    </div>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
h1 { margin: 0 0 8px; color: #111827; }
p { margin: 0; color: #6b7280; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.metric span { color: #6b7280; font-size: 13px; }
.metric strong { display: block; margin-top: 10px; font-size: 28px; color: #111827; }
.metric.wide { grid-column: 1 / -1; }
.metric.wide strong { font-size: 22px; color: #047857; }
.feedback { margin: 0; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>

