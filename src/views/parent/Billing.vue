<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, TrendingDown, TrendingUp, Receipt, CreditCard, Wallet } from 'lucide-vue-next'
import { parentApi, type BillingTransactionDTO, type BillingStatsDTO } from '../../api/parent'

const router = useRouter()

type TransactionType = 'all' | 'membership' | 'unlock' | 'refund'

const tabs: { key: TransactionType; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'membership', label: '会员订阅' },
  { key: 'unlock', label: '解锁消费' },
  { key: 'refund', label: '退款' }
]

const activeTab = ref<TransactionType>('all')
const transactions = ref<BillingTransactionDTO[]>([])
const stats = ref<BillingStatsDTO>({ totalSpent: 0, monthSpent: 0, totalCount: 0 })
const loading = ref(false)
const feedback = ref('')

const filteredTransactions = computed(() => {
  if (activeTab.value === 'all') return transactions.value
  return transactions.value.filter((t) => t.type === activeTab.value)
})

const countByType = (type: TransactionType) => {
  if (type === 'all') return transactions.value.length
  return transactions.value.filter((t) => t.type === type).length
}

const statusTextMap: Record<string, string> = {
  pending: '处理中',
  paid: '已支付',
  failed: '失败',
  refunded: '已退款'
}

const statusClassMap: Record<string, string> = {
  pending: 'status-pending',
  paid: 'status-paid',
  failed: 'status-failed',
  refunded: 'status-refunded'
}

const typeIconMap: Record<string, string> = {
  membership: '👑',
  unlock: '🔓',
  refund: '↩️',
  other: '📋'
}

const formatAmount = (amount: number) => {
  if (amount < 0) return `${amount.toFixed(2)}`
  if (amount === 0) return '免费'
  return `+${amount.toFixed(2)}`
}

const amountClass = (amount: number) => {
  if (amount < 0) return 'amount-refund'
  if (amount === 0) return 'amount-free'
  return 'amount-expense'
}

onMounted(async () => {
  loading.value = true
  feedback.value = ''
  try {
    const [list, st] = await Promise.all([parentApi.getBilling(), parentApi.getBillingStats()])
    transactions.value = list
    stats.value = st
  } catch (error) {
    feedback.value = (error as Error).message || '账单数据加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="module-page">
    <header class="module-header">
      <div class="header-left">
        <button class="btn-icon-back" @click="router.push('/parent-center')">
          <ArrowLeft :size="20" />
        </button>
        <div>
          <h1>账单中心</h1>
          <p>查看所有支付流水与消费记录</p>
        </div>
      </div>
    </header>

    <!-- 统计卡片区 -->
    <div class="stats-grid">
      <div class="stat-card stat-total">
        <div class="stat-icon-wrapper">
          <Wallet :size="22" />
        </div>
        <div class="stat-info">
          <span class="stat-label">累计支出</span>
          <span class="stat-value">¥{{ stats.totalSpent.toFixed(2) }}</span>
        </div>
      </div>
      <div class="stat-card stat-month">
        <div class="stat-icon-wrapper">
          <CreditCard :size="22" />
        </div>
        <div class="stat-info">
          <span class="stat-label">本月支出</span>
          <span class="stat-value">¥{{ stats.monthSpent.toFixed(2) }}</span>
        </div>
      </div>
      <div class="stat-card stat-count">
        <div class="stat-icon-wrapper">
          <Receipt :size="22" />
        </div>
        <div class="stat-info">
          <span class="stat-label">交易笔数</span>
          <span class="stat-value">{{ stats.totalCount }} 笔</span>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <article class="empty-card" v-if="loading">
      <p>账单数据加载中...</p>
    </article>

    <!-- 筛选标签 -->
    <div class="tabs" v-if="!loading">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span class="tab-count" v-if="tab.key !== 'all'">
          {{ countByType(tab.key) }}
        </span>
      </button>
    </div>

    <!-- 流水列表 -->
    <div class="transaction-list" v-if="!loading && filteredTransactions.length > 0">
      <article class="transaction-card" v-for="item in filteredTransactions" :key="item.id">
        <div class="tx-left">
          <span class="tx-type-icon">{{ typeIconMap[item.type] || '📋' }}</span>
          <div class="tx-info">
            <h3 class="tx-title">{{ item.title }}</h3>
            <div class="tx-meta">
              <span class="tx-order">{{ item.orderNo }}</span>
              <span class="tx-separator">·</span>
              <span>{{ item.payMethod }}</span>
            </div>
          </div>
        </div>
        <div class="tx-right">
          <span class="tx-amount" :class="amountClass(item.amount)">
            <TrendingDown v-if="item.amount < 0" :size="14" class="tx-trend-icon" />
            <TrendingUp v-else-if="item.amount > 0" :size="14" class="tx-trend-icon" />
            {{ formatAmount(item.amount) }}
          </span>
          <div class="tx-bottom">
            <span class="status-tag" :class="statusClassMap[item.status]">{{ statusTextMap[item.status] }}</span>
            <span class="tx-time">{{ item.createdAt }}</span>
          </div>
        </div>
      </article>
    </div>

    <!-- 空状态 -->
    <article class="empty-card" v-else-if="!loading">
      <div class="empty-icon">💳</div>
      <h3>暂无交易记录</h3>
      <p>开通会员或使用解锁功能后，支付流水将在此处显示。</p>
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
  gap: 16px;
}

.module-header,
.tabs,
.transaction-card,
.empty-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 20px;
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  margin: 0 0 4px;
  font-size: 22px;
  color: #111827;
}

h1 + p {
  margin: 0;
  color: #86868B;
  font-size: 14px;
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.stat-card {
  border-radius: 18px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  border: 1px solid transparent;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
}

.stat-total {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.stat-month {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: #fff;
}

.stat-count {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: #fff;
}

.stat-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 13px;
  opacity: 0.85;
  font-weight: 500;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

/* 筛选标签 */
.tabs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.tab-item {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: all 0.2s;
}

.tab-item.active {
  border-color: #5e5ce6;
  color: #5e5ce6;
  background: rgba(94, 92, 230, 0.08);
}

.tab-item:hover:not(.active) {
  border-color: #9ca3af;
  background: #f9fafb;
}

.tab-count {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
}

/* 流水列表 */
.transaction-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.transaction-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.transaction-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
  border-color: #d1d5db;
}

.tx-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.tx-type-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #F5F5F7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.tx-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.tx-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1D1D1F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tx-meta {
  font-size: 12px;
  color: #86868B;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tx-order {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.tx-separator {
  color: #d1d5db;
}

.tx-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 16px;
}

.tx-amount {
  font-size: 17px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tx-trend-icon {
  opacity: 0.7;
}

.amount-expense {
  color: #1D1D1F;
}

.amount-refund {
  color: #34C759;
}

.amount-free {
  color: #86868B;
  font-weight: 500;
  font-size: 14px;
}

.tx-bottom {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tx-time {
  font-size: 12px;
  color: #9ca3af;
}

/* 状态标签 */
.status-tag {
  border-radius: 999px;
  font-size: 11px;
  padding: 2px 8px;
  font-weight: 600;
  white-space: nowrap;
}

.status-pending {
  background: #fffbeb;
  color: #b45309;
}

.status-paid {
  background: #ecfdf5;
  color: #047857;
}

.status-failed {
  background: #fef2f2;
  color: #b91c1c;
}

.status-refunded {
  background: #eef2ff;
  color: #4338ca;
}

/* 空状态 */
.empty-card {
  text-align: center;
  padding: 48px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-card h3 {
  margin: 0 0 8px;
  color: #111827;
  font-size: 18px;
}

.empty-card p {
  margin: 0;
  color: #6b7280;
}

.feedback {
  margin: 0;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 12px;
  padding: 12px;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .transaction-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .tx-right {
    align-items: flex-start;
    margin-left: 0;
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
  }
}
</style>
