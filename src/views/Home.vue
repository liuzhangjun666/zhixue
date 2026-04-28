<script setup lang="ts">
import { useRouter } from 'vue-router'
import { onMounted, onUnmounted, ref } from 'vue'

const router = useRouter()
const bgCanvas = ref<HTMLCanvasElement | null>(null)

let animationFrameId: number
let mouseX = 0
let mouseY = 0
let targetMouseX = 0
let targetMouseY = 0

const handleMouseMove = (e: MouseEvent) => {
  targetMouseX = (e.clientX / window.innerWidth) * 2 - 1
  targetMouseY = (e.clientY / window.innerHeight) * 2 - 1
}

onMounted(() => {
  const canvas = bgCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  
  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', handleMouseMove)
  resize()

  class Orb {
    x: number
    y: number
    radius: number
    color: string
    vx: number
    vy: number
    originX: number
    originY: number
    parallaxFactor: number

    constructor(isAccent = false) {
      this.originX = Math.random() * window.innerWidth
      this.originY = Math.random() * window.innerHeight
      this.x = this.originX
      this.y = this.originY
      this.radius = Math.random() * 400 + 400
      this.vx = (Math.random() - 0.5) * 0.2
      this.vy = (Math.random() - 0.5) * 0.2
      
      const opacity = Math.random() * 0.04 + 0.02
      // 首页增加稍微亮一点的光球以营造活力
      this.color = isAccent ? `rgba(16, 168, 129, ${opacity})` : `rgba(94, 92, 230, ${opacity + 0.01})`
      this.parallaxFactor = Math.random() * 80 + 40
    }

    update() {
      this.originX += this.vx
      this.originY += this.vy

      if (this.originX < -this.radius || this.originX > window.innerWidth + this.radius) this.vx *= -1
      if (this.originY < -this.radius || this.originY > window.innerHeight + this.radius) this.vy *= -1

      this.x = this.originX - mouseX * this.parallaxFactor
      this.y = this.originY - mouseY * this.parallaxFactor
    }

    draw(ctx: CanvasRenderingContext2D) {
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
      ctx.fillStyle = this.color
      ctx.fill()
    }
  }

  // 6个紫球，2个绿球
  const orbs = [
    ...Array.from({ length: 6 }, () => new Orb()),
    ...Array.from({ length: 2 }, () => new Orb(true))
  ]

  const animate = () => {
    mouseX += (targetMouseX - mouseX) * 0.02
    mouseY += (targetMouseY - mouseY) * 0.02

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    orbs.forEach(orb => {
      orb.update()
      orb.draw(ctx)
    })
    animationFrameId = requestAnimationFrame(animate)
  }
  
  animate()
})

onUnmounted(() => {
  window.removeEventListener('resize', () => {})
  window.removeEventListener('mousemove', handleMouseMove)
  cancelAnimationFrame(animationFrameId)
})
</script>

<template>
  <div class="landing-page">
    <canvas ref="bgCanvas" class="ambient-canvas"></canvas>

    <main class="hero-section">
      <div class="hero-content">
        <div class="badge-pill">
          <span class="badge-dot"></span> 全新 Apple 级沉浸式体验
        </div>
        <h1 class="hero-title">重新定义<br>同城学习陪伴</h1>
        <p class="hero-subtitle">告别盲目寻找。基于智能算法匹配，在这里找到最懂孩子的良师益友，开启透明、放心的教育之旅。</p>
        
        <div class="cta-group">
          <button class="btn-primary" @click="router.push('/login')">
            我是家长，立即寻找
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-arrow"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
          <button class="btn-secondary" @click="router.push('/teacher-auth')">
            我是老师，入驻平台
          </button>
        </div>
      </div>

      <div class="features-grid">
        <div class="glass-feature-card">
          <div class="feature-icon bg-indigo">💡</div>
          <h3 class="feature-title">智能精准匹配</h3>
          <p class="feature-desc">通过多维数据分析算法，精确对接家长的真实需求与老师的核心专长。</p>
        </div>
        <div class="glass-feature-card">
          <div class="feature-icon bg-green">🛡️</div>
          <h3 class="feature-title">真实诚信保障</h3>
          <p class="feature-desc">全平台实名认证与严格的资质审核，结合真实互评体系，杜绝虚假信息。</p>
        </div>
        <div class="glass-feature-card">
          <div class="feature-icon bg-orange">💎</div>
          <h3 class="feature-title">价格极度透明</h3>
          <p class="feature-desc">摒弃繁杂的中介抽成，直接沟通，打造最纯粹、高效的同城教育生态。</p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.landing-page {
  position: relative;
  min-height: calc(100vh - 60px);
  background-color: #F5F5F7;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.ambient-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  filter: blur(120px);
}

.hero-section {
  position: relative;
  z-index: 10;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 80px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.hero-content {
  max-width: 800px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(94, 92, 230, 0.1);
  color: #5E5CE6;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 32px;
  border: 1px solid rgba(94, 92, 230, 0.2);
}

.badge-dot {
  width: 8px;
  height: 8px;
  background: #5E5CE6;
  border-radius: 50%;
  box-shadow: 0 0 8px #5E5CE6;
}

.hero-title {
  font-size: 72px;
  font-weight: 700;
  color: #1D1D1F;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin-bottom: 24px;
}

.hero-subtitle {
  font-size: 24px;
  color: #86868B;
  font-weight: 400;
  line-height: 1.5;
  margin-bottom: 48px;
  max-width: 680px;
}

.cta-group {
  display: flex;
  gap: 16px;
  margin-bottom: 80px;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #5E5CE6;
  color: #FFFFFF;
  border: none;
  height: 56px;
  padding: 0 32px;
  border-radius: 100px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 8px 24px -8px rgba(94, 92, 230, 0.5);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px -8px rgba(94, 92, 230, 0.6);
  opacity: 0.95;
}

.icon-arrow {
  width: 20px;
  height: 20px;
  transition: transform 0.3s;
}

.btn-primary:hover .icon-arrow {
  transform: translateX(4px);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: #1D1D1F;
  border: 1px solid rgba(0, 0, 0, 0.1);
  height: 56px;
  padding: 0 32px;
  border-radius: 100px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-secondary:hover {
  background: #FFFFFF;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.08);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
  width: 100%;
}

.glass-feature-card {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 24px;
  padding: 40px 32px;
  text-align: left;
  transition: all 0.3s ease;
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.05);
}

.glass-feature-card:hover {
  transform: translateY(-4px);
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.08);
}

.feature-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-bottom: 24px;
}

.bg-indigo { background: rgba(94, 92, 230, 0.15); }
.bg-green { background: rgba(16, 168, 129, 0.15); }
.bg-orange { background: rgba(245, 158, 11, 0.15); }

.feature-title {
  font-size: 20px;
  font-weight: 600;
  color: #1D1D1F;
  margin-bottom: 12px;
}

.feature-desc {
  font-size: 15px;
  color: #86868B;
  line-height: 1.6;
}

@media (max-width: 992px) {
  .hero-title {
    font-size: 48px;
  }
  .hero-subtitle {
    font-size: 18px;
  }
  .features-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .cta-group {
    flex-direction: column;
    width: 100%;
  }
  .btn-primary, .btn-secondary {
    width: 100%;
    justify-content: center;
  }
  .hero-section {
    padding: 40px 24px;
  }
}
</style>
