<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { teacherApi, type TeacherReviewDTO } from '../../api/teacher'

const loading = ref(false)
const feedback = ref('')
const reviews = ref<TeacherReviewDTO[]>([])
const keyword = ref('')

const average = computed(() => {
  if (reviews.value.length === 0) return 0
  const total = reviews.value.reduce((sum, item) => sum + item.rating, 0)
  return (total / reviews.value.length).toFixed(1)
})

const filtered = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return reviews.value
  return reviews.value.filter((item) => item.parentName.includes(kw) || item.subject.includes(kw) || item.content.includes(kw))
})

const stars = (rating: number) => '★'.repeat(Math.max(0, rating)) + '☆'.repeat(Math.max(0, 5 - rating))

const loadReviews = async () => {
  loading.value = true
  feedback.value = ''
  try {
    reviews.value = await teacherApi.getReviews()
  } catch (error) {
    feedback.value = (error as Error).message || '评价加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadReviews)
</script>

<template>
  <section class="page">
    <header class="card header">
      <div>
        <h1>我的评价</h1>
        <p>维护好评价有助于提升老师匹配排序。</p>
      </div>
      <div class="score">综合评分 {{ average }}</div>
    </header>

    <article class="card search">
      <input v-model="keyword" type="text" placeholder="按家长、科目、内容搜索" />
    </article>

    <article class="card" v-if="loading">
      <p>评价加载中...</p>
    </article>

    <div class="list" v-else-if="filtered.length > 0">
      <article class="card item" v-for="item in filtered" :key="item.id">
        <div class="top">
          <h2>{{ item.parentName }} · {{ item.subject }}</h2>
          <span class="stars">{{ stars(item.rating) }}</span>
        </div>
        <p class="date">{{ item.date }}</p>
        <p class="content">{{ item.content }}</p>
      </article>
    </div>

    <article class="card" v-else>
      <p>暂无评价记录。</p>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.header h1 { margin: 0 0 8px; color: #111827; }
.header p { margin: 0; color: #6b7280; }
.score { border-radius: 999px; background: rgba(16, 168, 129, 0.12); color: #047857; padding: 8px 12px; font-weight: 700; }
.search input { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; }
.search input:focus { border-color: #10a881; box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.12); }
.list { display: flex; flex-direction: column; gap: 12px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.item h2 { margin: 0; font-size: 18px; color: #111827; }
.stars { color: #f59e0b; font-weight: 700; }
.date { margin: 8px 0 0; color: #9ca3af; font-size: 13px; }
.content { margin: 10px 0 0; color: #4b5563; line-height: 1.6; }
.feedback { margin: 0; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px; }
</style>
