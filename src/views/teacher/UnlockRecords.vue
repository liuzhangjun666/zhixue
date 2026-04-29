<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { teacherApi, type UnlockRecordDTO } from '../../api/teacher'

const loading = ref(false)
const feedback = ref('')
const records = ref<UnlockRecordDTO[]>([])

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    records.value = await teacherApi.getUnlockRecords()
  } catch (error) {
    feedback.value = (error as Error).message || '解锁记录加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="card">
      <h1>解锁记录</h1>
      <p>查看联系方式解锁流水，便于核对额度消耗。</p>
    </header>

    <article class="card" v-if="loading">
      <p>记录加载中...</p>
    </article>

    <article class="card" v-else-if="records.length === 0">
      <p>暂无解锁记录。</p>
    </article>

    <article class="card" v-else>
      <table class="table">
        <thead>
          <tr>
            <th>家长</th>
            <th>请求ID</th>
            <th>解锁类型</th>
            <th>消耗</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in records" :key="item.id">
            <td>{{ item.parentName }}</td>
            <td>#{{ item.requestId }}</td>
            <td>{{ item.unlockType === 'wechat' ? '微信' : '手机号' }}</td>
            <td>{{ item.unlockCost }}</td>
            <td>{{ new Date(item.createdAt).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
h1 { margin: 0 0 8px; color: #111827; }
p { margin: 0; color: #6b7280; }
.table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
th { color: #374151; }
td { color: #6b7280; }
.feedback { margin: 0; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px; }
</style>
