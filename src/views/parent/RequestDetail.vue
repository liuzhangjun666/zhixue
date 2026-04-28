<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const requestId = ref(route.params.id)

const goBack = () => {
  router.push('/parent-center/requests')
}
</script>

<template>
  <div class="request-detail-page">
    <header class="detail-header">
      <button class="btn-back" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-arrow"><polyline points="15 18 9 12 15 6"></polyline></svg>
        返回列表
      </button>
      <h1>需求详情 #{{ requestId }}</h1>
    </header>

    <div class="placeholder-content">
      <h2>详情页开发中...</h2>
      <p>目前您已成功跳转到请求 ID: {{ requestId }} 的详情页。</p>
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
</style>
