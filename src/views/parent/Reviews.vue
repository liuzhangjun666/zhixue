<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { parentApi, type ReviewDTO } from '../../api/parent'

const router = useRouter()

const reviews = ref<ReviewDTO[]>([])

const filter = reactive({
  rating: 0,
  keyword: ''
})

const replyDraft = ref<Record<number, string>>({})
const loading = ref(false)
const postingId = ref<number | null>(null)
const feedback = ref('')

const filteredReviews = computed(() => {
  return reviews.value.filter((item) => {
    const matchedRating = filter.rating === 0 || item.rating === filter.rating
    const matchedKeyword =
      filter.keyword.trim() === '' ||
      item.content.includes(filter.keyword.trim()) ||
      item.teacherName.includes(filter.keyword.trim()) ||
      item.subject.includes(filter.keyword.trim())
    return matchedRating && matchedKeyword
  })
})

const averageRating = computed(() => {
  if (reviews.value.length === 0) return 0
  const sum = reviews.value.reduce((acc, item) => acc + item.rating, 0)
  return (sum / reviews.value.length).toFixed(1)
})

const totalByStar = (star: number) => reviews.value.filter((item) => item.rating === star).length

const starText = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating)

const submitReply = async (id: number) => {
  const draft = (replyDraft.value[id] || '').trim()
  if (!draft) return
  const target = reviews.value.find((item) => item.id === id)
  if (!target) return
  postingId.value = id
  feedback.value = ''
  try {
    await parentApi.replyReview(id, draft)
    target.reply = draft
    replyDraft.value[id] = ''
  } catch (error) {
    feedback.value = (error as Error).message || '提交失败，请稍后重试。'
  } finally {
    postingId.value = null
  }
}

const loadReviews = async () => {
  loading.value = true
  feedback.value = ''
  try {
    reviews.value = await parentApi.getReviews()
  } catch (error) {
    feedback.value = (error as Error).message || '评价数据加载失败。'
  } finally {
    loading.value = false
  }
}

onMounted(loadReviews)
</script>

<template>
  <section class="module-page">
    <header class="module-header">
      <div class="header-left">
        <button class="btn-icon-back" @click="router.push('/parent-center')">
          <ArrowLeft :size="20" />
        </button>
        <div>
          <h1>我的评价</h1>
          <p>查看历史评价并补充家长反馈。</p>
        </div>
      </div>
      <div class="score-pill">综合评分 {{ averageRating }}</div>
    </header>

    <article class="empty-card" v-if="loading">
      <p>评价数据加载中...</p>
    </article>

    <article class="summary-card" v-else>
      <div class="summary-row">
        <div class="summary-item" v-for="star in [5, 4, 3, 2, 1]" :key="star">
          <strong>{{ star }} 星</strong>
          <span>{{ totalByStar(star) }} 条</span>
        </div>
      </div>
    </article>

    <article class="filter-card" v-if="!loading">
      <label>
        评分筛选
        <select v-model.number="filter.rating">
          <option :value="0">全部</option>
          <option :value="5">5 星</option>
          <option :value="4">4 星</option>
          <option :value="3">3 星</option>
          <option :value="2">2 星</option>
          <option :value="1">1 星</option>
        </select>
      </label>

      <label>
        关键词
        <input v-model="filter.keyword" type="text" placeholder="老师名 / 科目 / 评价内容" />
      </label>
    </article>

    <div class="review-list" v-if="!loading && filteredReviews.length > 0">
      <article class="review-card" v-for="item in filteredReviews" :key="item.id">
        <div class="review-head">
          <div>
            <h2>{{ item.teacherName }} · {{ item.subject }}</h2>
            <p>{{ item.date }}</p>
          </div>
          <span class="stars">{{ starText(item.rating) }}</span>
        </div>

        <p class="review-content">{{ item.content }}</p>

        <div class="reply-box" v-if="item.reply">
          <strong>家长补充：</strong>
          <p>{{ item.reply }}</p>
        </div>

        <div class="reply-editor" v-else>
          <textarea v-model="replyDraft[item.id]" rows="2" placeholder="补充更多反馈（可选）" />
          <button class="btn-primary" @click="submitReply(item.id)" :disabled="postingId === item.id">
            {{ postingId === item.id ? '提交中...' : '提交补充' }}
          </button>
        </div>
      </article>
    </div>

    <article class="empty-card" v-else-if="!loading">
      <h3>没有匹配的评价</h3>
      <p>调整筛选条件后再查看。</p>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.module-page {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.module-header,
.summary-card,
.filter-card,
.review-card,
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
  font-size: 18px;
}

p {
  margin: 0;
  color: #6b7280;
}

.score-pill {
  border-radius: 999px;
  background: rgba(94, 92, 230, 0.1);
  color: #4338ca;
  padding: 8px 14px;
  font-weight: 700;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-item strong {
  color: #111827;
}

.filter-card {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 12px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #374151;
  font-size: 14px;
}

select,
input,
textarea {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  background: #fff;
  outline: none;
}

select:focus,
input:focus,
textarea:focus {
  border-color: #5e5ce6;
  box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.12);
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.review-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.stars {
  color: #f59e0b;
  font-weight: 700;
}

.review-content {
  margin-top: 12px;
  line-height: 1.6;
}

.reply-box {
  margin-top: 12px;
  background: #eef2ff;
  border-radius: 10px;
  padding: 10px 12px;
}

.reply-box strong {
  display: block;
  margin-bottom: 4px;
  color: #4338ca;
}

.reply-editor {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-primary {
  align-self: flex-start;
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 600;
  background: #4f46e5;
  color: #fff;
  cursor: pointer;
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
  .summary-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-card {
    grid-template-columns: 1fr;
  }
}
</style>
