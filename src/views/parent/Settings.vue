<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { parentApi } from '../../api/parent'

const securityForm = reactive({
  currentPassword: '',
  nextPassword: '',
  confirmPassword: ''
})

const notificationSetting = reactive({
  systemNotice: true,
  requestUpdate: true,
  classReminder: true,
  smsAlert: false
})

const privacySetting = reactive({
  showPhoneToMatchedTeacher: true,
  allowTeacherInvite: true,
  shareLearningReport: false
})

const saveStatus = ref('')
const deleteConfirmText = ref('')
const loading = ref(false)

const canUpdatePassword = computed(() => {
  return (
    securityForm.currentPassword.length >= 6 &&
    securityForm.nextPassword.length >= 6 &&
    securityForm.nextPassword === securityForm.confirmPassword
  )
})

const updatePassword = async () => {
  if (!canUpdatePassword.value) {
    saveStatus.value = '密码更新失败：请检查输入项。'
    return
  }
  try {
    await parentApi.updatePassword(securityForm.currentPassword, securityForm.nextPassword)
    securityForm.currentPassword = ''
    securityForm.nextPassword = ''
    securityForm.confirmPassword = ''
    saveStatus.value = '密码已更新。'
  } catch (error) {
    saveStatus.value = (error as Error).message || '密码更新失败。'
  }
}

const savePreference = async () => {
  try {
    await Promise.all([
      parentApi.updateNotifications({ ...notificationSetting }),
      parentApi.updatePrivacy({ ...privacySetting })
    ])
    saveStatus.value = '通知和隐私设置已保存。'
  } catch (error) {
    saveStatus.value = (error as Error).message || '设置保存失败。'
  }
}

const disableAccount = async () => {
  if (deleteConfirmText.value !== '注销账号') {
    saveStatus.value = '请输入“注销账号”后再执行。'
    return
  }
  try {
    await parentApi.deactivateAccount(deleteConfirmText.value)
    saveStatus.value = '已提交账号注销申请。'
    deleteConfirmText.value = ''
  } catch (error) {
    saveStatus.value = (error as Error).message || '注销申请提交失败。'
  }
}

const loadSettings = async () => {
  loading.value = true
  saveStatus.value = ''
  try {
    const data = await parentApi.getSettings()
    Object.assign(notificationSetting, data.notifications)
    Object.assign(privacySetting, data.privacy)
  } catch (error) {
    saveStatus.value = (error as Error).message || '设置数据加载失败。'
  } finally {
    loading.value = false
  }
}

onMounted(loadSettings)
</script>

<template>
  <section class="module-page">
    <header class="module-header">
      <h1>账户设置</h1>
      <p>管理安全信息、通知偏好和隐私权限。</p>
    </header>

    <article class="module-card" v-if="loading">
      <p>设置数据加载中...</p>
    </article>

    <article class="module-card" v-else>
      <h2>安全设置</h2>
      <div class="field-grid">
        <label>
          当前密码
          <input v-model="securityForm.currentPassword" type="password" />
        </label>
        <label>
          新密码
          <input v-model="securityForm.nextPassword" type="password" />
        </label>
        <label>
          确认新密码
          <input v-model="securityForm.confirmPassword" type="password" />
        </label>
      </div>
      <button class="btn-primary" @click="updatePassword">更新密码</button>
    </article>

    <article class="module-card" v-if="!loading">
      <h2>通知设置</h2>
      <div class="switch-list">
        <label class="switch-row">
          <input type="checkbox" v-model="notificationSetting.systemNotice" />
          <span>系统公告推送</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" v-model="notificationSetting.requestUpdate" />
          <span>需求状态变化提醒</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" v-model="notificationSetting.classReminder" />
          <span>上课前提醒</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" v-model="notificationSetting.smsAlert" />
          <span>短信提醒</span>
        </label>
      </div>
    </article>

    <article class="module-card" v-if="!loading">
      <h2>隐私权限</h2>
      <div class="switch-list">
        <label class="switch-row">
          <input type="checkbox" v-model="privacySetting.showPhoneToMatchedTeacher" />
          <span>仅对已匹配老师展示手机号</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" v-model="privacySetting.allowTeacherInvite" />
          <span>允许老师向我发送邀请</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" v-model="privacySetting.shareLearningReport" />
          <span>用于平台学习分析（匿名）</span>
        </label>
      </div>
      <button class="btn-primary" @click="savePreference">保存偏好</button>
    </article>

    <article class="module-card danger-card" v-if="!loading">
      <h2>危险操作</h2>
      <p>输入“注销账号”后可提交注销申请。</p>
      <input v-model="deleteConfirmText" type="text" placeholder='请输入 "注销账号"' />
      <button class="btn-danger" @click="disableAccount">提交注销申请</button>
    </article>

    <p class="feedback" v-if="saveStatus">{{ saveStatus }}</p>
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
.module-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 20px;
}

h1,
h2 {
  margin: 0 0 8px;
  color: #111827;
}

p {
  margin: 0;
  color: #6b7280;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0;
}

label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #374151;
  font-size: 14px;
}

input {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
}

input:focus {
  outline: none;
  border-color: #5e5ce6;
  box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.12);
}

.switch-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.switch-row {
  flex-direction: row;
  align-items: center;
}

.btn-primary,
.btn-danger {
  margin-top: 12px;
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: #4f46e5;
}

.btn-danger {
  background: #dc2626;
}

.danger-card {
  border-color: #fecaca;
  background: #fff7f7;
}

.feedback {
  margin: 0;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 12px;
  padding: 12px;
}

@media (max-width: 900px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
