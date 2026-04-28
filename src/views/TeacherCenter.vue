<script setup>
import { ref } from 'vue'
import GlassCard from '../components/GlassCard.vue'
import Modal from '../components/Modal.vue'

const showExposureModal = ref(false)
</script>

<template>
  <div class="dashboard-layout teacher-theme">
    <div class="left-col">
      <!-- 数据概览面板 -->
      <GlassCard class="mb-4">
        <h3 class="mb-3">📊 数据概览</h3>
        <div class="data-panel">
          <div class="data-item">
            <div class="data-label">本周浏览</div>
            <div class="data-value text-primary">156 <span class="data-unit">次</span></div>
          </div>
          <div class="data-divider"></div>
          <div class="data-item">
            <div class="data-label">历史浏览</div>
            <div class="data-value text-primary">1208 <span class="data-unit">次</span></div>
          </div>
          <div class="data-divider"></div>
          <div class="data-item">
            <div class="data-label">待处理请求</div>
            <div class="data-value text-danger">3 <span class="data-unit">单</span></div>
          </div>
        </div>
      </GlassCard>
      
      <!-- 会员/曝光卡片 -->
      <div class="vip-card">
        <div class="vip-header">
          <div>
            <div class="vip-title">🥇 金牌老师</div>
            <div class="vip-date">到期：2026-05-15</div>
          </div>
          <button class="btn btn-sm vip-btn" @click="showExposureModal = true">提升曝光</button>
        </div>
        <div class="vip-divider"></div>
        <div class="vip-benefits">
          <div class="benefit-item">• 曝光位置：顶部置顶</div>
          <div class="benefit-item">• 本周展现：8,542次</div>
          <div class="benefit-item">• 剩余免费解锁配额：无限</div>
        </div>
      </div>
    </div>
    
    <div class="right-col">
      <GlassCard>
        <h3 class="menu-title mb-3">常用功能</h3>
        <ul class="menu-list">
          <li class="menu-item">
            <div class="menu-left">
              <span class="menu-icon">📝</span>
              <span>编辑资料</span>
            </div>
            <span class="menu-arrow">›</span>
          </li>
          <li class="menu-item">
            <div class="menu-left">
              <span class="menu-icon">📋</span>
              <span>收到的辅导请求</span>
            </div>
            <div class="menu-right">
              <span class="badge-red">3</span>
              <span class="menu-arrow">›</span>
            </div>
          </li>
          <li class="menu-item">
            <div class="menu-left">
              <span class="menu-icon">⭐</span>
              <span>家长评价</span>
            </div>
            <div class="menu-right">
              <span class="text-light" style="font-size: 14px;">4.9 分</span>
              <span class="menu-arrow">›</span>
            </div>
          </li>
          <li class="menu-item" @click="showExposureModal = true">
            <div class="menu-left">
              <span class="menu-icon">💳</span>
              <span class="text-primary fw-bold">会员中心 (曝光升级)</span>
            </div>
            <span class="menu-arrow text-primary">›</span>
          </li>
          <li class="menu-item">
            <div class="menu-left">
              <span class="menu-icon">⚙️</span>
              <span>账户设置</span>
            </div>
            <span class="menu-arrow">›</span>
          </li>
        </ul>
      </GlassCard>
    </div>
    
    <!-- 提升曝光弹窗 -->
    <Modal :show="showExposureModal" title="📈 提升曝光，获取更多生源" @close="showExposureModal = false">
      <div class="exposure-modal-content">
        <div class="plan-card silver-plan">
          <div class="plan-header">
            <div class="plan-title">🥈 银牌老师</div>
            <div class="plan-price">¥ 29.9<span class="unit">/月</span></div>
          </div>
          <ul class="plan-features">
            <li>• 解锁次数：10次/天</li>
            <li>• 曝光位置：上部优先</li>
            <li>• 详细报表+实时通知</li>
          </ul>
          <button class="btn btn-ghost w-100 mt-3 border-silver" style="border: 1px solid var(--color-border); color: var(--color-text-main);">立即开通</button>
        </div>
        
        <div class="plan-card gold-plan recommended">
          <div class="badge-recommend">⭐ 推荐</div>
          <div class="plan-header">
            <div class="plan-title text-primary">🥇 金牌老师</div>
            <div class="plan-price text-parent">¥ 49.9<span class="unit text-light">/月</span></div>
          </div>
          <ul class="plan-features">
            <li>• 解锁次数：无限次数</li>
            <li>• 曝光位置：顶部置顶，独享流量</li>
            <li>• 优先推荐+专属客服指导</li>
          </ul>
          <button class="btn btn-teacher w-100 mt-3">立即开通</button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.teacher-theme {
  --color-primary: var(--color-teacher);
  --gradient-primary: var(--gradient-teacher);
}

.text-primary { color: var(--color-primary); }
.text-danger { color: var(--color-danger); }
.text-parent { color: var(--color-parent); }

.dashboard-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 32px;
}

/* 数据面板 */
.data-panel {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: var(--color-bg-page);
  padding: 24px;
  border-radius: 12px;
}

.data-item {
  text-align: center;
}

.data-label {
  font-size: 12px;
  color: var(--color-text-sub);
  margin-bottom: 8px;
}

.data-value {
  font-size: 28px;
  font-weight: bold;
}

.data-unit {
  font-size: 14px;
  font-weight: normal;
}

.data-divider {
  width: 1px;
  height: 40px;
  background: var(--color-border);
}

/* 会员卡片 */
.vip-card {
  background: var(--gradient-teacher);
  border-radius: 16px;
  padding: 32px;
  color: white;
  box-shadow: 0 8px 24px rgba(16, 168, 129, 0.2);
}

.vip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vip-title {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 8px;
}

.vip-date {
  font-size: 14px;
  opacity: 0.8;
}

.vip-btn {
  background: white;
  color: var(--color-teacher);
  border-radius: 20px;
}

.vip-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin: 24px 0;
}

.vip-benefits {
  font-size: 15px;
  line-height: 1.8;
}

.benefit-item {
  margin-bottom: 4px;
}

/* 右侧菜单 */
.menu-title { font-size: 18px; font-weight: bold; }
.menu-list { display: flex; flex-direction: column; }
.menu-item { display: flex; justify-content: space-between; align-items: center; height: 56px; border-bottom: 1px solid var(--color-border); cursor: pointer; transition: background 0.3s; }
.menu-item:hover { background: var(--color-bg-page); }
.menu-item:last-child { border-bottom: none; }
.menu-left { display: flex; align-items: center; gap: 12px; font-size: 15px; }
.menu-icon { font-size: 20px; }
.menu-right { display: flex; align-items: center; gap: 8px; }
.menu-arrow { font-size: 18px; color: var(--color-text-light); }
.badge-red { background: var(--color-danger); color: white; font-size: 12px; padding: 2px 6px; border-radius: 10px; }

/* 提升曝光弹窗 */
.exposure-modal-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
}

.plan-card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px;
  position: relative;
  transition: all 0.3s;
}

.plan-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.05);
}

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.plan-title {
  font-size: 18px;
  font-weight: bold;
}

.plan-price {
  font-size: 24px;
  font-weight: bold;
}

.unit {
  font-size: 14px;
  font-weight: normal;
}

.plan-features {
  font-size: 14px;
  color: var(--color-text-sub);
  line-height: 1.8;
}

.recommended {
  border-color: var(--color-primary);
  background: white;
  box-shadow: 0 4px 24px rgba(16, 168, 129, 0.1);
}

.badge-recommend {
  position: absolute;
  top: -12px;
  right: 24px;
  background: var(--color-primary);
  color: white;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 12px;
}

.w-100 { width: 100%; }

@media (max-width: 992px) {
  .dashboard-layout {
    grid-template-columns: 1fr;
  }
}
</style>
