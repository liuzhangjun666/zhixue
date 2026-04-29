<script setup>
import { onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GlassCard from '../components/GlassCard.vue'
import { parentRegister, parentSendCode, setAuthSession } from '../api/auth'

const router = useRouter()
const route = useRoute()
const currentStep = ref(1)

// Form data
const phone = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const agree = ref(false)

const nickname = ref('')
const gender = ref('')
const grade = ref('')
const loading = ref(false)
const sendingCode = ref(false)
const codeCountdown = ref(0)
const devCodeHint = ref('')
const errorText = ref('')
let countdownTimer = null

const clearCountdown = () => {
  if (countdownTimer) {
    window.clearInterval(countdownTimer)
    countdownTimer = null
  }
}

const startCountdown = (seconds = 60) => {
  clearCountdown()
  codeCountdown.value = seconds
  countdownTimer = window.setInterval(() => {
    codeCountdown.value = Math.max(0, codeCountdown.value - 1)
    if (codeCountdown.value <= 0) {
      clearCountdown()
    }
  }, 1000)
}

const sendCode = async () => {
  const normalizedPhone = phone.value.trim()
  if (!normalizedPhone) {
    errorText.value = '请先输入手机号'
    return
  }
  sendingCode.value = true
  errorText.value = ''
  try {
    const result = await parentSendCode(normalizedPhone)
    devCodeHint.value = result.debugCode ? `开发环境验证码：${result.debugCode}` : ''
    startCountdown(60)
  } catch (error) {
    errorText.value = (error && error.message) || '验证码发送失败'
  } finally {
    sendingCode.value = false
  }
}

const nextStep = () => {
  if (currentStep.value === 1 && !agree.value) {
    alert('请先同意用户协议')
    return
  }
  if (currentStep.value === 1 && password.value !== confirmPassword.value) {
    errorText.value = '两次密码输入不一致'
    return
  }
  if (currentStep.value === 1 && !code.value.trim()) {
    errorText.value = '请输入验证码'
    return
  }
  errorText.value = ''
  if (currentStep.value < 3) {
    currentStep.value++
  }
}

const finishRegister = async () => {
  if (!phone.value || !password.value || !nickname.value) {
    errorText.value = '请先填写必要信息'
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const data = await parentRegister({
      phone: phone.value.trim(),
      password: password.value,
      nickname: nickname.value.trim(),
      code: code.value.trim()
    })
    if (!data?.token || !data?.user) throw new Error('注册返回数据不完整')
    setAuthSession(data.token, data.user)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/parent-center'
    router.push(redirect)
  } catch (error) {
    errorText.value = (error && error.message) || '注册失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onUnmounted(() => {
  clearCountdown()
})
</script>

<template>
  <div class="auth-layout">
    <!-- 左侧品牌展示区 (复用登录页逻辑) -->
    <div class="brand-section">
      <div class="brand-logo">
        <div class="brand-logo-icon">🎓</div>
        <span class="brand-logo-text">知学空间</span>
      </div>
      <h1 class="brand-title">同城优秀学习陪伴者<br>与家长的精准匹配</h1>
      <p class="brand-subtitle">为您找到最适合孩子的良师益友</p>
      
      <div class="value-tags mt-4">
        <div class="value-tag">✓ 智能匹配</div>
        <div class="value-tag">✓ 诚信保障</div>
        <div class="value-tag">✓ 透明定价</div>
      </div>
      
      <div class="glow-effect glow-1"></div>
      <div class="glow-effect glow-2"></div>
    </div>
    
    <!-- 右侧注册表单 -->
    <div class="form-section">
      <GlassCard maxWidth="420px">
        <!-- 步骤指示器 -->
        <div class="step-indicator mb-4">
          <div class="step" :class="{ active: currentStep >= 1, completed: currentStep > 1 }">
            <div class="step-dot"></div>
            <span class="step-label">验证手机</span>
          </div>
          <div class="step-line" :class="{ active: currentStep >= 2 }"></div>
          <div class="step" :class="{ active: currentStep >= 2, completed: currentStep > 2 }">
            <div class="step-dot"></div>
            <span class="step-label">完善资料</span>
          </div>
          <div class="step-line" :class="{ active: currentStep >= 3 }"></div>
          <div class="step" :class="{ active: currentStep >= 3 }">
            <div class="step-dot"></div>
            <span class="step-label">完成注册</span>
          </div>
        </div>
        
        <!-- 步骤 1：验证手机 -->
        <div v-if="currentStep === 1" class="step-content">
          <form @submit.prevent="nextStep">
            <div class="input-group">
              <div class="input-wrapper">
                <input type="tel" v-model="phone" class="input-field" placeholder="手机号" required>
              </div>
            </div>
            
            <div class="input-group">
              <div class="input-wrapper">
                <input type="text" v-model="code" class="input-field" placeholder="验证码" required>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  style="margin-right: 4px;"
                  :disabled="sendingCode || codeCountdown > 0"
                  @click="sendCode"
                >
                  {{ codeCountdown > 0 ? `${codeCountdown}s后重发` : (sendingCode ? '发送中...' : '获取验证码') }}
                </button>
              </div>
            </div>
            <div class="hint-text" v-if="devCodeHint">{{ devCodeHint }}</div>
            
            <div class="input-group">
              <div class="input-wrapper">
                <input type="password" v-model="password" class="input-field" placeholder="设置密码" required>
              </div>
            </div>
            
            <div class="input-group">
              <div class="input-wrapper">
                <input type="password" v-model="confirmPassword" class="input-field" placeholder="确认密码" required>
              </div>
            </div>
            
            <div class="agreement mt-3 mb-4">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="agree" required>
                <span class="checkbox-text">
                  我已阅读并同意
                  <a href="#" class="link">《用户协议》</a>和
                  <a href="#" class="link">《隐私政策》</a>
                </span>
              </label>
            </div>
            
            <button type="submit" class="btn btn-primary w-100">下一步</button>
          </form>
        </div>
        
        <!-- 步骤 2：完善资料 -->
        <div v-if="currentStep === 2" class="step-content">
          <form @submit.prevent="nextStep">
            <div class="input-group">
              <div class="input-wrapper">
                <input type="text" v-model="nickname" class="input-field" placeholder="家长昵称" required>
              </div>
            </div>
            
            <div class="input-group">
              <select v-model="gender" class="select-field" required>
                <option value="" disabled>您的性别</option>
                <option value="male">爸爸</option>
                <option value="female">妈妈</option>
              </select>
            </div>
            
            <div class="input-group">
              <select v-model="grade" class="select-field" required>
                <option value="" disabled>孩子年级</option>
                <option value="primary">小学</option>
                <option value="middle">初中</option>
                <option value="high">高中</option>
              </select>
            </div>
            
            <button type="submit" class="btn btn-primary w-100 mt-4">下一步</button>
          </form>
        </div>
        
        <!-- 步骤 3：完成 -->
        <div v-if="currentStep === 3" class="step-content text-center">
          <div class="success-icon mb-3">✅</div>
          <h2 class="mb-2">注册成功！</h2>
          <p class="text-sub mb-4">欢迎加入知学空间，开始寻找优秀的学习陪伴者吧。</p>
          <button @click="finishRegister" class="btn btn-primary w-100" :disabled="loading">
            {{ loading ? '注册中...' : '前往个人中心' }}
          </button>
        </div>

        <p v-if="errorText" class="error-text mt-3">{{ errorText }}</p>
        
        <div v-if="currentStep === 1" class="text-center mt-4 text-sub">
          已有账号？ <router-link to="/login" class="text-primary">立即登录</router-link>
        </div>
      </GlassCard>
    </div>
  </div>
</template>

<style scoped>
/* 布局复用登录页 */
.auth-layout {
  display: flex;
  min-height: calc(100vh - 120px);
  align-items: center;
  gap: 48px;
}

.brand-section { flex: 4; position: relative; padding-right: 48px; }
.form-section { flex: 6; display: flex; justify-content: flex-end; }

.brand-logo { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
.brand-logo-icon { width: 44px; height: 44px; background: var(--gradient-primary); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; }
.brand-logo-text { font-size: 22px; font-weight: bold; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.brand-title { font-size: 36px; font-weight: bold; color: var(--color-text-main); line-height: 1.4; margin-bottom: 16px; }
.brand-subtitle { font-size: 16px; color: var(--color-text-sub); line-height: 1.8; }
.value-tags { display: flex; flex-direction: column; gap: 12px; }
.value-tag { display: inline-block; background: white; padding: 8px 16px; border-radius: 8px; font-size: 14px; color: var(--color-text-sub); width: fit-content; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }

.glow-effect { position: absolute; border-radius: 50%; filter: blur(80px); z-index: -1; }
.glow-1 { top: -50px; right: 0; width: 300px; height: 300px; background: rgba(124, 58, 237, 0.15); }
.glow-2 { bottom: -100px; left: 50px; width: 250px; height: 250px; background: rgba(233, 64, 122, 0.1); }

/* 步骤指示器 */
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 1;
}

.step-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  background: white;
  transition: all 0.3s;
}

.step.active .step-dot {
  border-color: var(--color-primary);
  background: var(--color-primary);
  box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.2);
}

.step.completed .step-dot {
  background: var(--color-teacher);
  border-color: var(--color-teacher);
  box-shadow: none;
}

.step-label {
  font-size: 12px;
  color: var(--color-text-light);
}

.step.active .step-label {
  color: var(--color-primary);
  font-weight: 600;
}

.step.completed .step-label {
  color: var(--color-text-main);
}

.step-line {
  flex: 1;
  height: 2px;
  background: var(--color-border);
  margin: 0 8px;
  transform: translateY(-10px);
  transition: all 0.3s;
}

.step-line.active {
  background: var(--color-primary);
}

/* 注册特有样式 */
.w-100 { width: 100%; }
.text-center { text-align: center; }

.select-field {
  width: 100%;
  height: 52px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  padding: 0 16px;
  font-size: 16px;
  color: var(--color-text-main);
  background: white;
  outline: none;
  transition: all 0.3s;
}

.select-field:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}

.agreement {
  display: flex;
  align-items: center;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-wrapper input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}

.checkbox-text {
  font-size: 13px;
  color: var(--color-text-sub);
}

.link {
  color: var(--color-primary);
  text-decoration: underline;
}

.success-icon {
  font-size: 64px;
}

.error-text {
  color: #e11d48;
  font-size: 13px;
}

.hint-text {
  color: #059669;
  font-size: 12px;
  margin-top: -6px;
  margin-bottom: 10px;
}

@media (max-width: 992px) {
  .auth-layout { flex-direction: column; gap: 32px; }
  .brand-section { padding-right: 0; text-align: center; }
  .value-tags { align-items: center; }
  .form-section { justify-content: center; width: 100%; }
}
</style>
