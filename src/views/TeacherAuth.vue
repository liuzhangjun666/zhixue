<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import GlassCard from '../components/GlassCard.vue'
import { setAuthSession, teacherLogin, teacherRegister } from '../api/auth'

const router = useRouter()
const currentStep = ref(1)
const isLoginMode = ref(false)

// Form data
const phone = ref('')
const code = ref('')
const password = ref('')

const nickname = ref('')
const gender = ref('')
const subject = ref('')
const exp = ref('')
const loading = ref(false)
const errorText = ref('')

const switchToLogin = () => {
  isLoginMode.value = true
  currentStep.value = 1
  errorText.value = ''
}

const switchToRegister = () => {
  isLoginMode.value = false
  currentStep.value = 1
  errorText.value = ''
}

const nextStep = () => {
  if (currentStep.value === 1 && (!phone.value || !password.value)) {
    errorText.value = '请填写手机号和密码'
    return
  }
  if (currentStep.value === 2 && (!nickname.value || !subject.value)) {
    errorText.value = '请填写姓名和科目'
    return
  }
  errorText.value = ''
  if (currentStep.value < 4) {
    currentStep.value++
  }
}

const finishRegister = async () => {
  loading.value = true
  errorText.value = ''
  try {
    const data = await teacherRegister({
      phone: phone.value.trim(),
      password: password.value,
      nickname: nickname.value.trim(),
      subject: subject.value.trim(),
      experience: exp.value.trim()
    })
    if (!data?.token || !data?.user) throw new Error('注册返回数据不完整')
    setAuthSession(data.token, data.user)
    router.push('/teacher-center')
  } catch (error) {
    errorText.value = (error && error.message) || '提交失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const handleTeacherLogin = async () => {
  if (!phone.value || !password.value) {
    errorText.value = '请填写手机号和密码'
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const data = await teacherLogin({
      phone: phone.value.trim(),
      password: password.value
    })
    if (!data?.token || !data?.user) throw new Error('登录返回数据不完整')
    setAuthSession(data.token, data.user)
    router.push('/teacher-center')
  } catch (error) {
    errorText.value = (error && error.message) || '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-layout teacher-theme">
    <!-- 左侧品牌展示区 -->
    <div class="brand-section">
      <div class="brand-logo">
        <div class="brand-logo-icon">🎓</div>
        <span class="brand-logo-text">知学空间 · 老师端</span>
      </div>
      <h1 class="brand-title">加入知学空间<br>传递知识的价值</h1>
      <p class="brand-subtitle">成为优秀的学习陪伴者，收获尊重与回报</p>
      
      <div class="value-tags mt-4">
        <div class="value-tag">✓ 专业认证</div>
        <div class="value-tag">✓ 优质学员</div>
        <div class="value-tag">✓ 灵活定价</div>
      </div>
      
      <div class="glow-effect glow-1"></div>
      <div class="glow-effect glow-2"></div>
    </div>
    
    <!-- 右侧注册表单 -->
    <div class="form-section">
      <GlassCard maxWidth="420px">
        <div class="mode-switch mb-4">
          <button class="mode-btn" :class="{ active: !isLoginMode }" @click="switchToRegister">老师入驻</button>
          <button class="mode-btn" :class="{ active: isLoginMode }" @click="switchToLogin">已有账号登录</button>
        </div>

        <div v-if="isLoginMode" class="step-content">
          <form @submit.prevent="handleTeacherLogin">
            <div class="input-group">
              <div class="input-wrapper">
                <input type="tel" v-model="phone" class="input-field" placeholder="手机号" required>
              </div>
            </div>

            <div class="input-group">
              <div class="input-wrapper">
                <input type="password" v-model="password" class="input-field" placeholder="密码" required>
              </div>
            </div>

            <button type="submit" class="btn btn-teacher w-100 mt-4" :disabled="loading">
              {{ loading ? '登录中...' : '登录老师中心' }}
            </button>
          </form>
        </div>

        <template v-else>
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
          <div class="step" :class="{ active: currentStep >= 3, completed: currentStep > 3 }">
            <div class="step-dot"></div>
            <span class="step-label">身份认证</span>
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
                <button type="button" class="btn btn-ghost btn-teacher-ghost btn-sm" style="margin-right: 4px;">获取验证码</button>
              </div>
            </div>
            
            <div class="input-group">
              <div class="input-wrapper">
                <input type="password" v-model="password" class="input-field" placeholder="设置密码" required>
              </div>
            </div>
            
            <button type="submit" class="btn btn-teacher w-100 mt-4">下一步</button>
          </form>
        </div>
        
        <!-- 步骤 2：完善资料 -->
        <div v-if="currentStep === 2" class="step-content">
          <form @submit.prevent="nextStep">
            <div class="avatar-upload mb-4">
              <div class="upload-box">
                <span class="upload-icon">+</span>
                <span class="upload-text">上传头像</span>
              </div>
              <p class="upload-hint">支持 JPG、PNG，建议 200×200</p>
            </div>
          
            <div class="input-group">
              <div class="input-wrapper">
                <input type="text" v-model="nickname" class="input-field" placeholder="真实姓名" required>
              </div>
            </div>
            
            <div class="input-group">
              <select v-model="gender" class="select-field" required>
                <option value="" disabled>性别</option>
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </div>

            <div class="input-group">
              <div class="input-wrapper">
                <input type="text" v-model="subject" class="input-field" placeholder="擅长科目（如数学）" required>
              </div>
            </div>

            <div class="input-group">
              <div class="input-wrapper">
                <input type="text" v-model="exp" class="input-field" placeholder="教学经验（如3年）">
              </div>
            </div>
            
            <button type="submit" class="btn btn-teacher w-100 mt-4">下一步</button>
          </form>
        </div>
        
        <!-- 步骤 3：资质认证 -->
        <div v-if="currentStep === 3" class="step-content">
          <div class="cert-upload mb-4">
            <div class="cert-icon">📄</div>
            <p class="cert-title">上传教师资格证或从业证明</p>
            <p class="cert-desc">（选填，提升诚信评分）</p>
            <button class="btn btn-ghost btn-teacher-ghost mt-3">选择文件</button>
            <p class="upload-hint mt-2">支持 JPG、PNG、PDF，不超过 5MB</p>
          </div>
          
          <button @click="nextStep" class="btn btn-teacher w-100">提交认证</button>
          <button @click="nextStep" class="btn btn-ghost btn-teacher-ghost w-100 mt-2 border-0">跳过，以后再传</button>
        </div>
        
        <!-- 步骤 4：完成 -->
        <div v-if="currentStep === 4" class="step-content text-center">
          <div class="success-icon mb-3">✅</div>
          <h2 class="mb-2">入驻成功！</h2>
          <p class="text-sub mb-4">您的资料已提交，去完善更多信息提升曝光率吧。</p>
          <button @click="finishRegister" class="btn btn-teacher w-100" :disabled="loading">
            {{ loading ? '提交中...' : '前往个人中心' }}
          </button>
        </div>
        </template>

        <p v-if="errorText" class="error-text mt-3">{{ errorText }}</p>
        
        <div v-if="!isLoginMode && currentStep === 1" class="text-center mt-4 text-sub">
          已有老师账号？ <button class="inline-link-btn text-teacher" @click="switchToLogin">立即登录</button>
        </div>
        <div v-if="isLoginMode" class="text-center mt-4 text-sub">
          还没有老师账号？ <button class="inline-link-btn text-teacher" @click="switchToRegister">去入驻</button>
        </div>
      </GlassCard>
    </div>
  </div>
</template>

<style scoped>
/* 覆盖主色调为老师绿 */
.teacher-theme {
  --color-primary: var(--color-teacher);
  --gradient-primary: var(--gradient-teacher);
}

.btn-teacher-ghost {
  color: var(--color-teacher);
  border-color: var(--color-teacher);
}

.btn-teacher-ghost:hover {
  background: rgba(16, 168, 129, 0.08);
}

.auth-layout {
  display: flex;
  min-height: calc(100vh - 120px);
  align-items: center;
  gap: 48px;
}

.brand-section { flex: 4; position: relative; padding-right: 48px; }
.form-section { flex: 6; display: flex; justify-content: flex-end; }

.brand-logo { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
.brand-logo-icon { width: 44px; height: 44px; background: var(--gradient-teacher); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; }
.brand-logo-text { font-size: 22px; font-weight: bold; background: var(--gradient-teacher); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.brand-title { font-size: 36px; font-weight: bold; color: var(--color-text-main); line-height: 1.4; margin-bottom: 16px; }
.brand-subtitle { font-size: 16px; color: var(--color-text-sub); line-height: 1.8; }
.value-tags { display: flex; flex-direction: column; gap: 12px; }
.value-tag { display: inline-block; background: white; padding: 8px 16px; border-radius: 8px; font-size: 14px; color: var(--color-text-sub); width: fit-content; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }

.glow-effect { position: absolute; border-radius: 50%; filter: blur(80px); z-index: -1; }
.glow-1 { top: -50px; right: 0; width: 300px; height: 300px; background: rgba(16, 168, 129, 0.15); }
.glow-2 { bottom: -100px; left: 50px; width: 250px; height: 250px; background: rgba(5, 150, 105, 0.1); }

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
  border-color: var(--color-teacher);
  background: var(--color-teacher);
  box-shadow: 0 0 0 4px rgba(16, 168, 129, 0.2);
}

.step.completed .step-dot {
  background: var(--color-primary);
  border-color: var(--color-primary);
  box-shadow: none;
}

.step-label {
  font-size: 12px;
  color: var(--color-text-light);
}

.step.active .step-label {
  color: var(--color-teacher);
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
  background: var(--color-teacher);
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mode-btn {
  border: 1px solid var(--color-border);
  background: white;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-sub);
}

.mode-btn.active {
  border-color: var(--color-teacher);
  color: var(--color-teacher);
  background: rgba(16, 168, 129, 0.08);
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
  border-color: var(--color-teacher);
  box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.1);
}

/* 上传区样式 */
.avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.upload-box {
  width: 100%;
  height: 160px;
  border: 2px dashed var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
  background: rgba(255,255,255,0.5);
}

.upload-box:hover {
  border-color: var(--color-teacher);
  background: rgba(16, 168, 129, 0.05);
}

.upload-icon {
  font-size: 32px;
  color: var(--color-text-light);
  margin-bottom: 8px;
}

.upload-text {
  color: var(--color-text-sub);
  font-size: 14px;
}

.upload-hint {
  font-size: 12px;
  color: var(--color-text-light);
}

.cert-upload {
  text-align: center;
  padding: 32px 0;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: white;
}

.cert-icon { font-size: 48px; margin-bottom: 16px; }
.cert-title { font-weight: bold; margin-bottom: 4px; }
.cert-desc { font-size: 14px; color: var(--color-text-sub); }
.border-0 { border: none !important; }

.success-icon { font-size: 64px; }
.error-text {
  color: #e11d48;
  font-size: 13px;
}

.inline-link-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: inherit;
}
</style>
