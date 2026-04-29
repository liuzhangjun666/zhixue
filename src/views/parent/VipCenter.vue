<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { parentApi, type MembershipPlanDTO } from '../../api/parent'

const router = useRouter()

const currentPlan = ref({
  name: '普通用户',
  expireAt: '-',
  remainingUnlock: 0,
  weeklyPriorityQuota: 0
})

const plans = ref<MembershipPlanDTO[]>([])

const selectedPlanId = ref('')
const autoRenew = ref(true)
const processing = ref(false)
const loading = ref(false)
const resultText = ref('')
const feedback = ref('')

const selectedPlan = computed(() => plans.value.find((item) => item.id === selectedPlanId.value) || plans.value[0])

const openVip = async () => {
  if (!selectedPlan.value) return
  processing.value = true
  resultText.value = ''
  feedback.value = ''
  try {
    await parentApi.subscribeMembership(selectedPlan.value.id, autoRenew.value)
    currentPlan.value.name = selectedPlan.value.name
    resultText.value = `已开通 ${selectedPlan.value.name}，有效期 ${selectedPlan.value.durationMonth} 个月。`
  } catch (error) {
    feedback.value = (error as Error).message || '开通失败，请稍后重试。'
  } finally {
    processing.value = false
  }
}

const loadMembershipData = async () => {
  loading.value = true
  feedback.value = ''
  try {
    const [status, planList] = await Promise.all([parentApi.getMembershipStatus(), parentApi.getMembershipPlans()])
    currentPlan.value.name = status.planName
    currentPlan.value.expireAt = status.expireAt
    currentPlan.value.remainingUnlock = status.remainingUnlock
    currentPlan.value.weeklyPriorityQuota = status.weeklyPriorityQuota
    plans.value = planList
    selectedPlanId.value = planList[0]?.id || ''
  } catch (error) {
    feedback.value = (error as Error).message || '会员信息加载失败。'
  } finally {
    loading.value = false
  }
}

onMounted(loadMembershipData)
</script>

<template>
  <section class="module-page">
    <header class="module-header">
      <div class="header-left">
        <button class="btn-icon-back" @click="router.push('/parent-center')">
          <ArrowLeft :size="20" />
        </button>
        <div>
          <h1>会员中心</h1>
          <p>管理会员权益，按家庭需求选择套餐。</p>
        </div>
      </div>
      <span class="tag-current">当前：{{ currentPlan.name }}</span>
    </header>

    <article class="current-card">
      <h2>当前会员状态</h2>
      <div class="status-grid">
        <div>
          <span>到期时间</span>
          <strong>{{ currentPlan.expireAt }}</strong>
        </div>
        <div>
          <span>今日剩余解锁</span>
          <strong>{{ currentPlan.remainingUnlock }} 次</strong>
        </div>
        <div>
          <span>本周优先匹配额度</span>
          <strong>{{ currentPlan.weeklyPriorityQuota }} 次</strong>
        </div>
      </div>
    </article>

    <article class="current-card" v-if="loading">
      <p>会员信息加载中...</p>
    </article>

    <div class="plan-grid" v-else>
      <article
        class="plan-card"
        v-for="plan in plans"
        :key="plan.id"
        :class="{ selected: selectedPlanId === plan.id }"
        @click="selectedPlanId = plan.id"
      >
        <div class="plan-head">
          <h3>{{ plan.name }}</h3>
          <span class="recommend" v-if="plan.recommended">推荐</span>
        </div>
        <p class="price">¥{{ plan.price }} / {{ plan.durationMonth }} 个月</p>
        <ul>
          <li v-for="item in plan.features" :key="item">{{ item }}</li>
        </ul>
      </article>
    </div>

    <article class="action-card" v-if="!loading && selectedPlan">
      <label class="switch-row">
        <input type="checkbox" v-model="autoRenew" />
        <span>开通后自动续费（到期前 24 小时提醒）</span>
      </label>

      <button class="btn-primary" :disabled="processing" @click="openVip">
        {{ processing ? '处理中...' : `开通 ${selectedPlan.name}` }}
      </button>
    </article>

    <p class="result" v-if="resultText">{{ resultText }}</p>
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
.current-card,
.plan-card,
.action-card {
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

h2,
h3 {
  margin: 0;
  color: #111827;
}

p {
  margin: 0;
  color: #6b7280;
}

.tag-current {
  align-self: flex-start;
  background: rgba(94, 92, 230, 0.1);
  color: #4338ca;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
}

.status-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.status-grid div {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-grid span {
  color: #6b7280;
  font-size: 13px;
}

.status-grid strong {
  color: #111827;
}

.plan-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.plan-card {
  cursor: pointer;
  transition: all 0.2s ease;
}

.plan-card:hover {
  border-color: #c7d2fe;
}

.plan-card.selected {
  border-color: #5e5ce6;
  box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.12);
}

.plan-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.recommend {
  background: #eef2ff;
  color: #4338ca;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
}

.price {
  margin: 10px 0 12px;
  color: #111827;
  font-weight: 700;
}

ul {
  margin: 0;
  padding-left: 16px;
  color: #4b5563;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.action-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.switch-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #374151;
}

.btn-primary {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #5e5ce6, #4f46e5);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: default;
}

.result {
  margin: 0;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 12px;
  padding: 12px;
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
  .status-grid,
  .plan-grid {
    grid-template-columns: 1fr;
  }

  .action-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
