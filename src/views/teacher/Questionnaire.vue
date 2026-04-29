<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { teacherApi } from '../../api/teacher'

const loading = ref(false)
const saving = ref(false)
const feedback = ref('')

const form = reactive({
  teachingFocus: '',
  preferredParentType: '',
  expectation: '',
  communicationStyle: '',
  availableTime: ''
})

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    const data = await teacherApi.getQuestionnaire()
    const answers = (data?.answers || {}) as Record<string, any>
    form.teachingFocus = String(answers.teachingFocus || '')
    form.preferredParentType = String(answers.preferredParentType || '')
    form.expectation = String(answers.expectation || '')
    form.communicationStyle = String(answers.communicationStyle || '')
    form.availableTime = String(answers.availableTime || '')
  } catch (error) {
    feedback.value = (error as Error).message || '问卷加载失败'
  } finally {
    loading.value = false
  }
}

const submit = async () => {
  saving.value = true
  feedback.value = ''
  try {
    await teacherApi.saveQuestionnaire({ ...form })
    feedback.value = '问卷已保存'
  } catch (error) {
    feedback.value = (error as Error).message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="card header">
      <div>
        <h1>匹配问卷</h1>
        <p>补充教学偏好信息，系统会据此提高匹配准确度。</p>
      </div>
      <button class="btn-primary" :disabled="saving" @click="submit">{{ saving ? '保存中...' : '保存问卷' }}</button>
    </header>

    <article class="card" v-if="loading">
      <p>问卷加载中...</p>
    </article>

    <article class="card" v-else>
      <div class="grid">
        <label>
          教学重点
          <input v-model="form.teachingFocus" type="text" placeholder="如：提分、习惯培养、竞赛" />
        </label>
        <label>
          偏好家长类型
          <input v-model="form.preferredParentType" type="text" placeholder="如：重视沟通、执行力强" />
        </label>
        <label class="full">
          教学预期
          <textarea v-model="form.expectation" rows="3" placeholder="如：8周提升基础分，12周冲刺拔高"></textarea>
        </label>
        <label>
          沟通风格
          <input v-model="form.communicationStyle" type="text" placeholder="如：每周一次复盘" />
        </label>
        <label>
          可授课时间
          <input v-model="form.availableTime" type="text" placeholder="如：周二/周四 19:00-21:00" />
        </label>
      </div>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
h1 { margin: 0 0 8px; color: #111827; }
p { margin: 0; color: #6b7280; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; gap: 8px; color: #374151; font-size: 14px; }
.full { grid-column: 1 / -1; }
input, textarea { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; }
input:focus, textarea:focus { border-color: #10a881; box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.12); }
.btn-primary { border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #10a881, #059669); cursor: pointer; }
.feedback { margin: 0; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 12px; padding: 12px; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
