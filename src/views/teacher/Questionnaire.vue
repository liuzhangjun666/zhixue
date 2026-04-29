<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { teacherApi } from '../../api/teacher'

const loading = ref(false)
const saving = ref(false)
const feedback = ref('')

const subjectOptions = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '美术', '音乐', '体育', '编程']
const styleOptions = [
  { label: '严厉严格', value: 'strict' },
  { label: '温和耐心', value: 'gentle' },
  { label: '灵活互动', value: 'flexible' },
  { label: '侧重引导', value: 'guiding' }
]
const methodOptions = [
  { label: '一对一', value: 'one_on_one' },
  { label: '小班(3-5人)', value: 'small_class' },
  { label: '线上', value: 'online' },
  { label: '线下', value: 'offline' }
]
const studentTypeOptions = [
  { label: '基础薄弱', value: 'weak' },
  { label: '中等水平', value: 'average' },
  { label: '优秀拔高', value: 'excellent' },
  { label: '不限', value: 'any' }
]
const feeRangeOptions = [
  { label: '100元/小时以内', value: 'under_100' },
  { label: '100-150元/小时', value: '100_150' },
  { label: '150-200元/小时', value: '150_200' },
  { label: '200元/小时以上', value: 'over_200' }
]

const form = reactive({
  subjects: [] as string[],
  teachingStyle: '',
  teachingMethods: [] as string[],
  studentType: '',
  areas: [] as string[],
  feeRange: ''
})
const areasInput = ref('')

const canSubmit = computed(() => {
  return form.subjects.length > 0 && form.teachingStyle && form.teachingMethods.length > 0 && form.studentType && form.feeRange
})

const toggleArray = (arr: string[], value: string) => {
  const index = arr.indexOf(value)
  if (index >= 0) arr.splice(index, 1)
  else arr.push(value)
}

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    const data = await teacherApi.getQuestionnaire()
    const answers = (data?.answers || {}) as Record<string, any>
    form.subjects = Array.isArray(answers.subjects) ? answers.subjects : []
    form.teachingStyle = String(answers.teachingStyle || '')
    form.teachingMethods = Array.isArray(answers.teachingMethods) ? answers.teachingMethods : []
    form.studentType = String(answers.studentType || '')
    form.areas = Array.isArray(answers.areas) ? answers.areas : []
    form.feeRange = String(answers.feeRange || '')
    areasInput.value = form.areas.join('、')
  } catch (error) {
    feedback.value = (error as Error).message || '问卷加载失败'
  } finally {
    loading.value = false
  }
}

const submit = async () => {
  if (!canSubmit.value) {
    feedback.value = '请完整填写6题内容后再保存'
    return
  }
  saving.value = true
  feedback.value = ''
  try {
    form.areas = areasInput.value.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean)
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
        <h1>匹配问卷（6题）</h1>
        <p>完善匹配偏好，系统会在每周推送时优先计算你的条件。</p>
      </div>
      <button class="btn-primary" :disabled="saving" @click="submit">{{ saving ? '保存中...' : '保存问卷' }}</button>
    </header>

    <article class="card" v-if="loading">
      <p>问卷加载中...</p>
    </article>

    <article class="card" v-else>
      <div class="q-item">
        <h3>Q1 擅长授课科目（多选）</h3>
        <div class="chips">
          <button v-for="item in subjectOptions" :key="item" class="chip" :class="{ active: form.subjects.includes(item) }" @click="toggleArray(form.subjects, item)">{{ item }}</button>
        </div>
      </div>

      <div class="q-item">
        <h3>Q2 核心教学风格（单选）</h3>
        <div class="radios">
          <label v-for="item in styleOptions" :key="item.value"><input type="radio" :value="item.value" v-model="form.teachingStyle" /> {{ item.label }}</label>
        </div>
      </div>

      <div class="q-item">
        <h3>Q3 主要授课形式（多选）</h3>
        <div class="chips">
          <button v-for="item in methodOptions" :key="item.value" class="chip" :class="{ active: form.teachingMethods.includes(item.value) }" @click="toggleArray(form.teachingMethods, item.value)">{{ item.label }}</button>
        </div>
      </div>

      <div class="q-item">
        <h3>Q4 可接受的学生类型（单选）</h3>
        <div class="radios">
          <label v-for="item in studentTypeOptions" :key="item.value"><input type="radio" :value="item.value" v-model="form.studentType" /> {{ item.label }}</label>
        </div>
      </div>

      <div class="q-item">
        <h3>Q5 可授课区域（多选，区县用分隔符）</h3>
        <input v-model="areasInput" type="text" placeholder="如：思明区、湖里区" />
      </div>

      <div class="q-item">
        <h3>Q6 可接受服务费（单选）</h3>
        <div class="radios">
          <label v-for="item in feeRangeOptions" :key="item.value"><input type="radio" :value="item.value" v-model="form.feeRange" /> {{ item.label }}</label>
        </div>
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
.q-item { border-bottom: 1px solid #eef2f7; padding: 14px 0; }
.q-item:last-child { border-bottom: none; }
.q-item h3 { margin: 0 0 10px; color: #111827; font-size: 16px; }
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chip { border: 1px solid #d1d5db; border-radius: 999px; padding: 8px 12px; background: #fff; cursor: pointer; }
.chip.active { border-color: #10a881; background: rgba(16, 168, 129, 0.12); color: #047857; }
.radios { display: flex; flex-wrap: wrap; gap: 14px; }
.radios label { color: #374151; display: inline-flex; gap: 6px; align-items: center; }
input[type='text'] { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
input[type='text']:focus { outline: none; border-color: #10a881; box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.12); }
.btn-primary { border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #10a881, #059669); cursor: pointer; }
.feedback { margin: 0; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 12px; padding: 12px; }
</style>
