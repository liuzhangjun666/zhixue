<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parentLogin, setAuthSession } from '../api/auth'

const router = useRouter()
const route = useRoute()
const phone = ref<string>('')
const password = ref<string>('')
const showPassword = ref<boolean>(false)
const loading = ref<boolean>(false)
const errorText = ref<string>('')
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

    constructor() {
      this.originX = Math.random() * window.innerWidth
      this.originY = Math.random() * window.innerHeight
      this.x = this.originX
      this.y = this.originY
      this.radius = Math.random() * 400 + 300
      this.vx = (Math.random() - 0.5) * 0.15
      this.vy = (Math.random() - 0.5) * 0.15
      const opacity = Math.random() * 0.05 + 0.03
      this.color = `rgba(94, 92, 230, ${opacity})`
      this.parallaxFactor = Math.random() * 60 + 30
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

  const orbs = Array.from({ length: 6 }, () => new Orb())

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

const handleLogin = async () => {
  if (!phone.value || !password.value) return
  loading.value = true
  errorText.value = ''
  try {
    const data = await parentLogin({ phone: phone.value.trim(), password: password.value })
    if (!data?.token || !data?.user) {
      throw new Error('登录返回数据不完整')
    }
    setAuthSession(data.token, data.user)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/parent-center'
    router.push(redirect)
  } catch (error) {
    errorText.value = (error as Error).message || '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="apple-auth-layout">
    <!-- Ambient Bokeh Canvas -->
    <canvas ref="bgCanvas" class="ambient-canvas"></canvas>

    <div class="top-logo">
      <div class="logo-icon">🎓</div>
      <span class="logo-text">知学空间</span>
    </div>

    <div class="brand-section">
      <div class="brand-content">
        <h1 class="brand-title">同城优秀学习陪伴者<br>与家长的精准匹配</h1>
        <p class="brand-subtitle">为您找到最适合孩子的良师益友</p>
        
        <div class="value-tags">
          <div class="tag-item">智能匹配</div>
          <div class="tag-item">诚信保障</div>
          <div class="tag-item">透明定价</div>
        </div>
      </div>
    </div>
    
    <div class="form-section">
      <div class="apple-glass-card">
        <div class="form-header">
          <h2 class="form-title">登录</h2>
          <p class="form-subtitle">使用您的手机号继续</p>
        </div>
        
        <form @submit.prevent="handleLogin" class="auth-form">
          <div class="input-group">
            <div class="input-wrapper">
              <span class="input-prefix">+86</span>
              <input 
                type="tel" 
                v-model="phone" 
                class="input-field" 
                placeholder="手机号" 
                maxlength="11"
                required
              >
            </div>
          </div>
          
          <div class="input-group">
            <div class="input-wrapper">
              <input 
                :type="showPassword ? 'text' : 'password'" 
                v-model="password" 
                class="input-field" 
                placeholder="密码"
                required
              >
              <button 
                type="button" 
                class="password-toggle" 
                @click="showPassword = !showPassword"
                aria-label="切换密码可见性"
              >
                <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-eye"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-eye"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              </button>
            </div>
          </div>

          <div class="forgot-pwd-row">
            <a href="#" class="forgot-pwd-link">忘记密码？</a>
          </div>
          
          <button type="submit" class="btn-apple-primary" :disabled="loading">
            {{ loading ? '验证中...' : '登录' }}
          </button>

          <p v-if="errorText" class="error-text">{{ errorText }}</p>
          
          <div class="form-divider">
            <span>或使用以下方式登录</span>
          </div>

          <button type="button" class="btn-third-party">
            <span class="wechat-icon">💬</span> 微信登录
          </button>
          
          <div class="register-row">
            <span class="text-secondary">没有账号？</span>
            <router-link to="/register" class="link-primary">创建新的知学空间账号</router-link>
          </div>
        </form>
      </div>
      
      <div class="teacher-portal-link">
        <router-link to="/teacher-auth">老师入口</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.apple-auth-layout {
  display: flex;
  min-height: 100vh;
  background-color: #F5F5F7;
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.ambient-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  filter: blur(100px);
}

.top-logo {
  position: absolute;
  top: 40px;
  left: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: #1D1D1F;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: white;
}

.logo-text {
  font-size: 20px;
  font-weight: 600;
  color: #1D1D1F;
  letter-spacing: -0.01em;
}

.brand-section {
  flex: 1;
  display: flex;
  align-items: center;
  padding-left: 12%;
  position: relative;
  z-index: 1;
}

.brand-title {
  font-size: 44px;
  font-weight: 600;
  color: #1D1D1F;
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin-bottom: 16px;
}

.brand-subtitle {
  font-size: 20px;
  color: #86868B;
  font-weight: 400;
  margin-bottom: 48px;
}

.value-tags {
  display: flex;
  gap: 12px;
}

.tag-item {
  background: rgba(0, 0, 0, 0.04);
  color: #1D1D1F;
  padding: 8px 16px;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 500;
}

.form-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0 48px;
  position: relative;
  z-index: 1;
}

.apple-glass-card {
  width: 100%;
  max-width: 400px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.08);
  border-radius: 24px;
  padding: 40px;
}

.form-header {
  text-align: center;
  margin-bottom: 32px;
}

.form-title {
  font-size: 24px;
  font-weight: 600;
  color: #1D1D1F;
  margin-bottom: 8px;
}

.form-subtitle {
  font-size: 15px;
  color: #86868B;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-wrapper {
  display: flex;
  align-items: center;
  background: #FAFAFA;
  border: 1px solid #E5E5EA;
  border-radius: 12px;
  height: 48px;
  padding: 0 16px;
  transition: all 0.2s ease;
}

.input-wrapper:focus-within {
  border-color: #5E5CE6;
  background: #FFFFFF;
  box-shadow: 0 0 0 4px rgba(94, 92, 230, 0.15);
}

.input-prefix {
  font-size: 15px;
  color: #1D1D1F;
  margin-right: 12px;
  padding-right: 12px;
  border-right: 1px solid #E5E5EA;
}

.input-field {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  color: #1D1D1F;
}

.input-field::placeholder {
  color: #86868B;
}

.password-toggle {
  background: none;
  border: none;
  color: #86868B;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.password-toggle:hover {
  color: #1D1D1F;
}

.icon-eye {
  width: 18px;
  height: 18px;
}

.forgot-pwd-row {
  display: flex;
  justify-content: flex-end;
  margin-top: -4px;
}

.forgot-pwd-link {
  font-size: 13px;
  color: #5E5CE6;
  text-decoration: none;
}

.forgot-pwd-link:hover {
  text-decoration: underline;
}

.btn-apple-primary {
  background: #5E5CE6;
  color: #FFFFFF;
  border: none;
  height: 48px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-top: 8px;
}

.btn-apple-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-apple-primary:disabled {
  background: #E5E5EA;
  color: #86868B;
  cursor: not-allowed;
}

.form-divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 16px 0;
}

.form-divider::before,
.form-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #E5E5EA;
}

.form-divider span {
  font-size: 13px;
  color: #86868B;
  padding: 0 16px;
}

.btn-third-party {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  border-radius: 12px;
  background: transparent;
  border: 1px solid #E5E5EA;
  color: #1D1D1F;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-third-party:hover {
  background: rgba(0, 0, 0, 0.02);
}

.wechat-icon {
  font-size: 18px;
}

.register-row {
  text-align: center;
  margin-top: 16px;
  font-size: 14px;
}

.text-secondary {
  color: #86868B;
}

.link-primary {
  color: #5E5CE6;
  text-decoration: none;
  margin-left: 4px;
}

.link-primary:hover {
  text-decoration: underline;
}

.teacher-portal-link {
  position: absolute;
  bottom: 40px;
  font-size: 13px;
}

.teacher-portal-link a {
  color: #86868B;
  text-decoration: none;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.teacher-portal-link a:hover {
  opacity: 1;
  text-decoration: underline;
}

.error-text {
  color: #e11d48;
  font-size: 13px;
  margin: 4px 0 0;
}

@media (max-width: 992px) {
  .brand-section {
    display: none;
  }
  .form-section {
    padding: 24px;
  }
  .top-logo {
    top: 24px;
    left: 24px;
  }
}
</style>
