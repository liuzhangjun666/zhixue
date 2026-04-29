<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { teacherApi } from '../../api/teacher'

const loading = ref(false)
const feedback = ref('')

const passwordForm = reactive({
  currentPassword: '',
  nextPassword: '',
  confirmPassword: ''
})

const notifications = reactive({
  newRequest: true,
  messageReminder: true,
  systemNotice: true
})

const privacy = reactive({
  showPhoneToParent: true,
  allowParentInvite: true
})

const canUpdatePassword = computed(() => {
  return (
    passwordForm.currentPassword.length >= 6 &&
    passwordForm.nextPassword.length >= 6 &&
    passwordForm.nextPassword === passwordForm.confirmPassword
  )
})

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    const data = await teacherApi.getSettings()
    Object.assign(notifications, data.notifications)
    Object.assign(privacy, data.privacy)
  } catch (error) {
    feedback.value = (error as Error).message || '设置加载失败'
  } finally {
    loading.value = false
  }
}

const updatePassword = async () => {
  if (!canUpdatePassword.value) {
    feedback.value = '请检查密码输入项'
    return
  }
  try {
    await teacherApi.updatePassword(passwordForm.currentPassword, passwordForm.nextPassword)
    passwordForm.currentPassword = ''
    passwordForm.nextPassword = ''
    passwordForm.confirmPassword = ''
    feedback.value = '密码已更新'
  } catch (error) {
    feedback.value = (error as Error).message || '密码更新失败'
  }
}

const savePrefs = async () => {
  try {
    await Promise.all([
      teacherApi.updateNotifications({ ...notifications }),
      teacherApi.updatePrivacy({ ...privacy })
    ])
    feedback.value = '通知和隐私设置已保存'
  } catch (error) {
    feedback.value = (error as Error).message || '保存设置失败'
  }
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="card">
      <h1>账户设置</h1>
      <p>管理账号安全、消息通知和隐私偏好。</p>
    </header>

    <article class="card" v-if="loading">
      <p>设置加载中...</p>
    </article>

    <article class="card" v-else>
      <h2>安全设置</h2>
      <div class="grid">
        <label>
          当前密码
          <input v-model="passwordForm.currentPassword" type="password" />
        </label>
        <label>
          新密码
          <input v-model="passwordForm.nextPassword" type="password" />
        </label>
        <label>
          确认新密码
          <input v-model="passwordForm.confirmPassword" type="password" />
        </label>
      </div>
      <button class="btn-primary" @click="updatePassword">更新密码</button>
    </article>

    <article class="card" v-if="!loading">
      <h2>通知设置</h2>
      <div class="switch-list">
        <label><input type="checkbox" v-model="notifications.newRequest" /> 新请求提醒</label>
        <label><input type="checkbox" v-model="notifications.messageReminder" /> 消息提醒</label>
        <label><input type="checkbox" v-model="notifications.systemNotice" /> 系统通知</label>
      </div>
    </article>

    <article class="card" v-if="!loading">
      <h2>隐私设置</h2>
      <div class="switch-list">
        <label><input type="checkbox" v-model="privacy.showPhoneToParent" /> 匹配后展示手机号</label>
        <label><input type="checkbox" v-model="privacy.allowParentInvite" /> 允许家长主动邀约</label>
      </div>
      <button class="btn-primary" @click="savePrefs">保存偏好</button>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
h1, h2 { margin: 0 0 8px; color: #111827; }
p { margin: 0; color: #6b7280; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }
label { display: flex; flex-direction: column; gap: 8px; color: #374151; font-size: 14px; }
input[type='password'] { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
input[type='password']:focus { outline: none; border-color: #10a881; box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.12); }
.switch-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.switch-list label { flex-direction: row; align-items: center; gap: 10px; }
.btn-primary { margin-top: 12px; border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #10a881, #059669); cursor: pointer; }
.feedback { margin: 0; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 12px; padding: 12px; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
