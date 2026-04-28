<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { teacherApi, type TeacherMembershipPlanDTO } from '../../api/teacher'

const loading = ref(false)
const processing = ref(false)
const feedback = ref('')
const resultText = ref('')

const planName = ref('普通老师')
const expireAt = ref<string | null>(null)
const plans = ref<TeacherMembershipPlanDTO[]>([])
const selectedPlanId = ref('')
const autoRenew = ref(true)

const selectedPlan = computed(() => plans.value.find((item) => item.id === selectedPlanId.value) || null)

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    const [status, list] = await Promise.all([teacherApi.getMembershipStatus(), teacherApi.getMembershipPlans()])
    planName.value = status.planName
    expireAt.value = status.expireAt
    plans.value = list
    selectedPlanId.value = list[0]?.id || ''
  } catch (error) {
    feedback.value = (error as Error).message || '会员信息加载失败'
  } finally {
    loading.value = false
  }
}

const subscribe = async () => {
  if (!selectedPlan.value) return
  processing.value = true
  feedback.value = ''
  resultText.value = ''
  try {
    await teacherApi.subscribeMembership(selectedPlan.value.id, autoRenew.value)
    planName.value = selectedPlan.value.name
    resultText.value = `已开通 ${selectedPlan.value.name}`
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '开通失败'
  } finally {
    processing.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="card">
      <h1>会员中心</h1>
      <p>通过曝光升级获得更多家长咨询机会。</p>
      <span class="tag">当前：{{ planName }}</span>
      <span class="sub">到期：{{ expireAt || '未开通' }}</span>
    </header>

    <article class="card" v-if="loading">
      <p>会员数据加载中...</p>
    </article>

    <div class="plans" v-else>
      <article class="card plan" v-for="plan in plans" :key="plan.id" :class="{ active: selectedPlanId === plan.id }" @click="selectedPlanId = plan.id">
        <div class="top">
          <h2>{{ plan.name }}</h2>
          <span class="badge" v-if="plan.recommended">推荐</span>
        </div>
        <p class="price">￥{{ plan.price }} / {{ plan.durationMonth }}个月</p>
        <ul>
          <li v-for="feature in plan.features" :key="feature">{{ feature }}</li>
        </ul>
      </article>
    </div>

    <article class="card action" v-if="!loading && selectedPlan">
      <label>
        <input type="checkbox" v-model="autoRenew" />
        <span>自动续费（到期前提醒）</span>
      </label>
      <button class="btn-primary" :disabled="processing" @click="subscribe">{{ processing ? '处理中...' : `开通 ${selectedPlan.name}` }}</button>
    </article>

    <p class="result" v-if="resultText">{{ resultText }}</p>
    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
h1 { margin: 0 0 8px; color: #111827; }
p { margin: 0; color: #6b7280; }
.tag { display: inline-block; margin-top: 10px; border-radius: 999px; background: rgba(16, 168, 129, 0.12); color: #047857; padding: 6px 12px; font-weight: 700; }
.sub { display: block; margin-top: 8px; color: #6b7280; font-size: 13px; }
.plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.plan { cursor: pointer; transition: all 0.2s ease; }
.plan.active { border-color: #10a881; box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.12); }
.top { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; color: #111827; font-size: 18px; }
.badge { border-radius: 999px; background: #ecfdf5; color: #047857; padding: 4px 8px; font-size: 12px; }
.price { margin: 10px 0 12px; color: #111827; font-size: 20px; font-weight: 700; }
ul { margin: 0; padding-left: 16px; color: #4b5563; display: flex; flex-direction: column; gap: 6px; }
.action { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.action label { display: inline-flex; align-items: center; gap: 8px; color: #374151; }
.btn-primary { border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #10a881, #059669); cursor: pointer; }
.result { margin: 0; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 12px; padding: 12px; }
.feedback { margin: 0; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px; }
@media (max-width: 900px) {
  .plans { grid-template-columns: 1fr; }
  .action { flex-direction: column; align-items: flex-start; }
}
</style>
