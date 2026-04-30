<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero-main">
        <p class="eyebrow">同城教培匹配平台</p>
        <h1>让家长更快找到合适老师<br>让老师更稳定获得生源</h1>
        <p class="hero-desc">
          覆盖需求发布、老师筛选、即时沟通、会员权益与匹配追踪，
          为教培场景提供可落地、可持续的双边匹配服务。
        </p>

        <div class="cta-row">
          <button class="btn-primary btn-home" @click="router.push('/login')">家长入口</button>
          <button class="btn-secondary btn-home" @click="router.push('/teacher-auth')">老师入口</button>
        </div>

        <ul class="trust-list">
          <li>实名与资质审核</li>
          <li>需求与会话全链路记录</li>
          <li>评价与解锁行为可追溯</li>
        </ul>
      </div>

      <aside class="hero-side">
        <div class="data-card">
          <h3>平台服务</h3>
          <div class="stat-grid">
            <div class="stat-item">
              <div class="stat-label">匹配方式</div>
              <div class="stat-value">按需求推荐 + 定期优选</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">沟通体验</div>
              <div class="stat-value">在线发消息，及时收到回复</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">安全保障</div>
              <div class="stat-value">账号保护与身份核验</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">服务记录</div>
              <div class="stat-value">需求、沟通、评价全程留档</div>
            </div>
          </div>
        </div>
      </aside>
    </section>

    <section class="feature-section">
      <article class="feature-card">
        <h4>家长侧</h4>
        <p>发布需求、筛选老师、发起沟通、查看进度与通知。</p>
      </article>
      <article class="feature-card">
        <h4>老师侧</h4>
        <p>完善资料、提交认证、查看匹配池、管理请求与评价。</p>
      </article>
      <article class="feature-card">
        <h4>平台侧</h4>
        <p>会员分层曝光、解锁额度控制、基础风控与行为留痕。</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  padding: 28px 0 40px;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 24px;
  align-items: stretch;
}

.hero-main,
.data-card,
.feature-card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  box-shadow: var(--shadow-card);
}

.hero-main {
  padding: 36px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: #eff6ff;
  color: var(--color-primary-dark);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 14px;
}

.hero-main h1 {
  font-size: 40px;
  line-height: 1.28;
  letter-spacing: -0.01em;
  color: #0f172a;
}

.hero-desc {
  margin-top: 14px;
  max-width: 720px;
  color: var(--color-text-sub);
  font-size: 16px;
}

.cta-row {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-home {
  min-width: 128px;
  height: 46px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
}

.btn-secondary {
  background: #ffffff;
  color: var(--color-primary-dark);
  border: 1px solid #bfdbfe;
}

.btn-secondary:hover {
  background: #eff6ff;
}

.trust-list {
  margin-top: 22px;
  display: grid;
  gap: 10px;
}

.trust-list li {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #334155;
}

.trust-list li::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #16a34a;
  margin-right: 10px;
}

.data-card {
  padding: 28px;
}

.data-card h3 {
  font-size: 20px;
  color: #0f172a;
}

.stat-grid {
  margin-top: 14px;
  display: grid;
  gap: 12px;
}

.stat-item {
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.stat-label {
  font-size: 12px;
  color: #64748b;
}

.stat-value {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.feature-section {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.feature-card {
  padding: 22px;
}

.feature-card h4 {
  font-size: 18px;
  color: #0f172a;
}

.feature-card p {
  margin-top: 10px;
  color: var(--color-text-sub);
  font-size: 14px;
}

@media (max-width: 980px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .hero-main h1 {
    font-size: 32px;
  }

  .feature-section {
    grid-template-columns: 1fr;
  }
}
</style>
