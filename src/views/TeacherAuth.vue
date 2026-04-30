<script setup>
import { onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GlassCard from '../components/GlassCard.vue'
import { teacherApi } from '../api/teacher'
import { teacherLogin, teacherRegister, teacherSendCode, setAuthSession } from '../api/auth'

const router = useRouter()
const route = useRoute()
const currentStep = ref(1)
const isLoginMode = ref(false)
const POLICY_VERSION = '2026-04-30'

const phone = ref('')
const code = ref('')
const password = ref('')
const agree = ref(false)

const nickname = ref('')
const gender = ref('')
const subject = ref('')
const exp = ref('')
const teachingMethods = ref([])
const feeRange = ref('100_150')
const school = ref('')
const inviteCode = ref('')

const certType = ref('teacher_license')
const certFileName = ref('')
const certUrl = ref('')
const feedback = ref('')
const errorText = ref('')
const loading = ref(false)
const sendingCode = ref(false)
const codeCountdown = ref(0)
const devCodeHint = ref('')
let codeTimer = null

const targetPath = () => (typeof route.query.redirect === 'string' ? route.query.redirect : '/teacher-center')

const switchToLogin = () => {
  isLoginMode.value = true
  currentStep.value = 1
  feedback.value = ''
  errorText.value = ''
}

const switchToRegister = () => {
  isLoginMode.value = false
  currentStep.value = 1
  feedback.value = ''
  errorText.value = ''
}

const handleTeacherLogin = async () => {
  loading.value = true
  feedback.value = ''
  errorText.value = ''
  try {
    const data = await teacherLogin({ phone: phone.value.trim(), password: password.value })
    if (!data?.token || !data?.user) throw new Error('登录返回数据不完整')
    setAuthSession(data.token, data.user)
    teacherApi.setToken(data.token)
    router.push(targetPath())
  } catch (error) {
    errorText.value = error?.message || '老师登录失败'
  } finally {
    loading.value = false
  }
}

const clearCodeTimer = () => {
  if (codeTimer) {
    window.clearInterval(codeTimer)
    codeTimer = null
  }
}

const startCodeCountdown = (seconds = 60) => {
  clearCodeTimer()
  codeCountdown.value = seconds
  codeTimer = window.setInterval(() => {
    codeCountdown.value = Math.max(0, codeCountdown.value - 1)
    if (codeCountdown.value <= 0) {
      clearCodeTimer()
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
    const result = await teacherSendCode(normalizedPhone)
    devCodeHint.value = result.debugCode ? `开发环境验证码：${result.debugCode}` : ''
    startCodeCountdown(60)
  } catch (error) {
    errorText.value = error?.message || '验证码发送失败'
  } finally {
    sendingCode.value = false
  }
}

const toggleTeachingMethod = (method) => {
  if (teachingMethods.value.includes(method)) {
    teachingMethods.value = teachingMethods.value.filter((item) => item !== method)
    return
  }
  teachingMethods.value = [...teachingMethods.value, method]
}

const nextStep = async () => {
  feedback.value = ''
  if (currentStep.value === 1) {
    if (!phone.value.trim() || !password.value || !code.value.trim()) {
      errorText.value = '请填写手机号、验证码和密码'
      return
    }
    if (!agree.value) {
      errorText.value = '请先阅读并同意用户协议与隐私政策'
      return
    }
    if (password.value.length < 6) {
      errorText.value = '密码至少 6 位'
      return
    }
    errorText.value = ''
    currentStep.value = 2
    return
  }

  if (currentStep.value === 2) {
    if (!nickname.value.trim() || !subject.value.trim()) {
      errorText.value = '请至少填写姓名和擅长科目'
      return
    }
    errorText.value = ''
    currentStep.value = 3
    return
  }
}

const handleCertFileChange = async (event) => {
  const input = event.target
  const file = input?.files?.[0]
  if (!file) return

  if (file.size > 2 * 1024 * 1024) {
    errorText.value = '认证文件请控制在 2MB 以内'
    input.value = ''
    return
  }

  certFileName.value = file.name
  errorText.value = ''

  const reader = new FileReader()
  reader.onload = () => {
    certUrl.value = typeof reader.result === 'string' ? reader.result : ''
  }
  reader.onerror = () => {
    errorText.value = '读取文件失败，请重试'
  }
  reader.readAsDataURL(file)
}

const finishRegister = async () => {
  loading.value = true
  feedback.value = ''
  errorText.value = ''
  try {
    const data = await teacherRegister({
      phone: phone.value.trim(),
      password: password.value,
      code: code.value.trim(),
      nickname: nickname.value.trim(),
      subject: subject.value.trim(),
      experience: exp.value.trim(),
      gender: gender.value || undefined,
      teachingMethods: teachingMethods.value,
      feeRange: feeRange.value,
      school: school.value.trim(),
      inviteCode: inviteCode.value.trim() || undefined,
      certType: certType.value,
      certUrl: certUrl.value.trim() || undefined,
      agree: agree.value,
      policyVersion: POLICY_VERSION
    })
    if (!data?.token || !data?.user) {
      throw new Error('注册返回数据不完整')
    }
    setAuthSession(data.token, data.user)
    teacherApi.setToken(data.token)
    if (certUrl.value.trim()) {
      await teacherApi.submitVerification(certType.value, certUrl.value.trim())
    }
    router.push(targetPath())
  } catch (error) {
    errorText.value = error?.message || '老师注册失败'
  } finally {
    loading.value = false
  }
}

onUnmounted(() => {
  clearCodeTimer()
})
</script>

<template>
  <div class="auth-layout teacher-theme">
    <div class="brand-section">
      <div class="brand-logo">
        <div class="brand-logo-icon">🎓</div>
        <span class="brand-logo-text">知学空间 · 老师端</span>
      </div>
      <h1 class="brand-title">加入知学空间<br>让专业教学被更多家长看见</h1>
      <p class="brand-subtitle">成为可信赖的同城学习陪伴者，持续获得优质生源。</p>

      <div class="value-tags mt-4">
        <div class="value-tag">✓ 专业认证</div>
        <div class="value-tag">✓ 优质学员</div>
        <div class="value-tag">✓ 灵活定价</div>
      </div>

      <div class="glow-effect glow-1"></div>
      <div class="glow-effect glow-2"></div>
    </div>

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
              <span class="step-label">提交审核</span>
            </div>
          </div>

          <div v-if="currentStep === 1" class="step-content">
            <form @submit.prevent="nextStep">
              <div class="input-group">
                <div class="input-wrapper">
                  <input type="tel" v-model="phone" class="input-field" placeholder="手机号" required>
                </div>
              </div>

              <div class="input-group">
                <div class="input-wrapper code-wrapper">
                  <input type="text" v-model="code" class="input-field" placeholder="验证码" required>
                  <button
                    type="button"
                    class="btn btn-ghost btn-teacher-ghost btn-sm"
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
                  <input type="password" v-model="password" class="input-field" placeholder="设置密码（至少6位）" required>
                </div>
              </div>

              <div class="agreement mt-2">
                <label class="checkbox-wrapper">
                  <input type="checkbox" v-model="agree" required>
                  <span class="checkbox-text">
                    我已阅读并同意
                    <router-link to="/legal/terms" class="link">《用户协议》</router-link>和
                    <router-link to="/legal/privacy" class="link">《隐私政策》</router-link>
                  </span>
                </label>
              </div>

              <button type="submit" class="btn btn-teacher w-100 mt-4">下一步</button>
            </form>
          </div>

          <div v-if="currentStep === 2" class="step-content">
            <form @submit.prevent="nextStep">
              <div class="input-group">
                <div class="input-wrapper">
                  <input type="text" v-model="nickname" class="input-field" placeholder="真实姓名" required>
                </div>
              </div>

              <div class="input-group">
                <select v-model="gender" class="select-field">
                  <option value="" disabled>性别（选填）</option>
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

              <div class="input-group">
                <div class="input-wrapper">
                  <input type="text" v-model="school" class="input-field" placeholder="毕业院校（选填）">
                </div>
              </div>

              <div class="input-group">
                <select v-model="feeRange" class="select-field">
                  <option value="under_100">100元/小时以内</option>
                  <option value="100_150">100-150元/小时</option>
                  <option value="150_200">150-200元/小时</option>
                  <option value="over_200">200元/小时以上</option>
                </select>
              </div>

              <div class="input-group">
                <div class="method-group">
                  <button type="button" class="method-chip" :class="{ active: teachingMethods.includes('one_on_one') }" @click="toggleTeachingMethod('one_on_one')">一对一</button>
                  <button type="button" class="method-chip" :class="{ active: teachingMethods.includes('small_class') }" @click="toggleTeachingMethod('small_class')">小班(3-5人)</button>
                  <button type="button" class="method-chip" :class="{ active: teachingMethods.includes('online') }" @click="toggleTeachingMethod('online')">线上</button>
                  <button type="button" class="method-chip" :class="{ active: teachingMethods.includes('offline') }" @click="toggleTeachingMethod('offline')">线下</button>
                </div>
              </div>

              <div class="input-group">
                <div class="input-wrapper">
                  <input type="text" v-model="inviteCode" class="input-field" placeholder="邀请码（选填）">
                </div>
              </div>

              <button type="submit" class="btn btn-teacher w-100 mt-4">下一步</button>
            </form>
          </div>

          <div v-if="currentStep === 3" class="step-content">
            <div class="cert-upload mb-4">
              <div class="cert-icon">📄</div>
              <p class="cert-title">上传教师资格证或从业证明</p>
              <p class="cert-desc">选填，提交后可提升信任度和曝光权重</p>

              <select v-model="certType" class="select-field mt-3">
                <option value="teacher_license">教师资格证</option>
                <option value="work_proof">从业证明</option>
                <option value="id_card">身份证明</option>
              </select>

              <label class="btn btn-ghost btn-teacher-ghost mt-3 file-btn">
                选择文件
                <input type="file" accept="image/png,image/jpeg,application/pdf" @change="handleCertFileChange" hidden>
              </label>
              <p class="upload-hint mt-2">支持 JPG、PNG、PDF，不超过 2MB</p>
              <p class="upload-hint" v-if="certFileName">已选择：{{ certFileName }}</p>
            </div>

            <button @click="finishRegister" class="btn btn-teacher w-100" :disabled="loading">
              {{ loading ? '提交中...' : '提交入驻审核' }}
            </button>
            <button @click="finishRegister" class="btn btn-ghost btn-teacher-ghost w-100 mt-2 border-0" :disabled="loading">跳过材料，直接提交</button>
          </div>

          <div v-if="currentStep === 4" class="step-content text-center">
            <div class="success-icon mb-3">✅</div>
            <h2 class="mb-2">已提交审核</h2>
            <p class="text-sub mb-4">资料已提交成功，可直接使用老师中心，审核结果会在通知中心同步。</p>
            <button @click="switchToLogin" class="btn btn-teacher w-100">返回登录</button>
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
/* layout */
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
.glow-1 { top: -50px; right: 0; width: 300px; height: 300px; background: rgba(16, 168, 129, 0.15); }
.glow-2 { bottom: -100px; left: 50px; width: 250px; height: 250px; background: rgba(20, 184, 166, 0.1); }

/* step indicator */
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

.step.active .step-dot,
.step.completed .step-dot {
  border-color: var(--color-teacher);
  background: var(--color-teacher);
  box-shadow: 0 0 0 4px rgba(16, 168, 129, 0.18);
}

.step-label {
  font-size: 12px;
  color: var(--color-text-light);
}

.step.active .step-label,
.step.completed .step-label {
  color: var(--color-teacher);
  font-weight: 600;
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

/* common */
.w-100 { width: 100%; }
.text-center { text-align: center; }
.code-wrapper { gap: 8px; }
.hint-text { color: #059669; font-size: 12px; margin-top: -6px; margin-bottom: 10px; }
.file-btn { display: inline-flex; cursor: pointer; }
.method-group { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
.method-chip {
  border: 1px solid var(--color-border);
  background: #fff;
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--color-text-sub);
}
.method-chip.active {
  border-color: var(--color-teacher);
  background: rgba(16, 168, 129, 0.12);
  color: #047857;
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

.checkbox-wrapper input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-teacher);
}

.checkbox-text {
  font-size: 13px;
  color: var(--color-text-sub);
}

.link {
  color: var(--color-teacher);
  text-decoration: underline;
}

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
  box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.12);
}

.success-icon {
  font-size: 64px;
}

.error-text {
  color: #e11d48;
  font-size: 13px;
}

@media (max-width: 992px) {
  .auth-layout { flex-direction: column; gap: 32px; }
  .brand-section { padding-right: 0; text-align: center; }
  .value-tags { align-items: center; }
  .form-section { justify-content: center; width: 100%; }
}
</style>
