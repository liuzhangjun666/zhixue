<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parentApi, type ParentRequestDTO } from '../../api/parent'

const route = useRoute()
const router = useRouter()
const requestId = Number(route.params.id || 0)
const loading = ref<boolean>(false)
const errorText = ref<string>('')
const detail = ref<ParentRequestDTO | null>(null)

const statusTextMap: Record<string, string> = {
  pending: '待处理',
  matching: '匹配中',
  scheduled: '已约课',
  completed: '已完成',
  cancelled: '已取消'
}

const statusText = computed(() => {
  const key = String(detail.value?.status || '')
  return statusTextMap[key] || key || '-'
})

const loadDetail = async () => {
  if (!requestId) {
    errorText.value = '无效的请求 ID'
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    detail.value = await parentApi.getRequestDetail(requestId)
  } catch (error) {
    errorText.value = (error as Error).message || '加载需求详情失败'
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.push('/parent/requests')
}

onMounted(loadDetail)
</script>

<template>
  <div class="request-detail-page">
    <header class="detail-header">
      <button class="btn-back" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-arrow"><polyline points="15 18 9 12 15 6"></polyline></svg>
        返回列表
      </button>
      <h1>需求详情 #{{ requestId || '-' }}</h1>
    </header>

    <div v-if="loading" class="placeholder-content">
      <h2>加载中...</h2>
      <p>正在获取需求详情</p>
    </div>

    <div v-else-if="errorText" class="placeholder-content error">
      <h2>加载失败</h2>
      <p>{{ errorText }}</p>
    </div>

    <div v-else-if="detail" class="detail-content">
      <div class="row">
        <span class="label">标题</span>
        <span class="value">{{ detail.title || '-' }}</span>
      </div>
      <div class="row">
        <span class="label">科目</span>
        <span class="value">{{ detail.subject || '-' }}</span>
      </div>
      <div class="row">
        <span class="label">年级</span>
        <span class="value">{{ detail.grade || '-' }}</span>
      </div>
      <div class="row">
        <span class="label">预算</span>
        <span class="value">{{ detail.budget || '-' }}</span>
      </div>
      <div class="row">
        <span class="label">时间安排</span>
        <span class="value">{{ detail.schedule || '-' }}</span>
      </div>
      <div class="row">
        <span class="label">匹配老师</span>
        <span class="value">{{ detail.teacherName || '待匹配' }}</span>
      </div>
      <div class="row">
        <span class="label">状态</span>
        <span class="value">{{ statusText }}</span>
      </div>
      <div class="row">
        <span class="label">创建时间</span>
        <span class="value">{{ detail.createdAt || '-' }}</span>
      </div>
      <div class="row">
        <span class="label">描述</span>
        <span class="value">{{ detail.description || '暂无描述' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.request-detail-page {
  background: #fff;
  border-radius: 18px;
  padding: 24px;
  min-height: 500px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 16px;
}

.detail-header h1 {
  margin: 0;
  font-size: 20px;
  color: #111827;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: #6b7280;
  font-size: 15px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: all 0.2s;
}

.btn-back:hover {
  background: #f3f4f6;
  color: #111827;
}

.icon-arrow {
  width: 18px;
  height: 18px;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #86868B;
}

.placeholder-content h2 {
  font-size: 22px;
  margin-bottom: 12px;
}

.placeholder-content.error {
  color: #b91c1c;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 10px;
}

.label {
  width: 90px;
  color: #6b7280;
  font-size: 14px;
  flex-shrink: 0;
}

.value {
  color: #111827;
  font-size: 15px;
  line-height: 1.5;
}
</style>
