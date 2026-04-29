<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { teacherApi } from '../../api/teacher'

const loading = ref(false)
const saving = ref(false)
const feedback = ref('')

const subjects = ['语文', '数学', '英语', '物理', '化学', '生物']
const grades = ['小学', '初中', '高中']

const form = reactive({
  teacherName: '',
  phone: '',
  city: '',
  bio: '',
  preferredSubjects: [] as string[],
  preferredGrades: [] as string[]
})

const toggle = (arr: string[], value: string) => {
  const index = arr.indexOf(value)
  if (index >= 0) {
    arr.splice(index, 1)
    return
  }
  arr.push(value)
}

const loadProfile = async () => {
  loading.value = true
  feedback.value = ''
  try {
    const data = await teacherApi.getProfile()
    form.teacherName = data.teacherName
    form.phone = data.phone
    form.city = data.city
    form.bio = data.bio
    form.preferredSubjects = Array.isArray(data.preferredSubjects) ? [...data.preferredSubjects] : []
    form.preferredGrades = Array.isArray(data.preferredGrades) ? [...data.preferredGrades] : []
  } catch (error) {
    feedback.value = (error as Error).message || '加载老师资料失败'
  } finally {
    loading.value = false
  }
}

const saveProfile = async () => {
  if (!form.teacherName.trim() || !/^1\d{10}$/.test(form.phone)) {
    feedback.value = '请填写正确的姓名和手机号'
    return
  }

  saving.value = true
  feedback.value = ''
  try {
    await teacherApi.updateProfile({ ...form })
    feedback.value = '资料已保存'
  } catch (error) {
    feedback.value = (error as Error).message || '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}

onMounted(loadProfile)
</script>

<template>
  <section class="page">
    <header class="card header">
      <div>
        <h1>编辑资料</h1>
        <p>完善个人信息有助于提高匹配准确度和转化率。</p>
      </div>
      <button class="btn-primary" :disabled="saving" @click="saveProfile">{{ saving ? '保存中...' : '保存资料' }}</button>
    </header>

    <article class="card" v-if="loading">
      <p>资料加载中...</p>
    </article>

    <article class="card" v-else>
      <div class="grid">
        <label>
          姓名
          <input v-model="form.teacherName" type="text" />
        </label>
        <label>
          手机号
          <input v-model="form.phone" type="tel" maxlength="11" />
        </label>
        <label>
          城市
          <input v-model="form.city" type="text" />
        </label>
        <label class="full">
          个人简介
          <textarea v-model="form.bio" rows="4" placeholder="介绍教学经验、擅长提分方向、授课风格"></textarea>
        </label>
      </div>
    </article>

    <article class="card">
      <h2>擅长科目</h2>
      <div class="chips">
        <button
          v-for="item in subjects"
          :key="item"
          class="chip"
          :class="{ active: form.preferredSubjects.includes(item) }"
          @click="toggle(form.preferredSubjects, item)"
        >
          {{ item }}
        </button>
      </div>
    </article>

    <article class="card">
      <h2>授课学段</h2>
      <div class="chips">
        <button
          v-for="item in grades"
          :key="item"
          class="chip"
          :class="{ active: form.preferredGrades.includes(item) }"
          @click="toggle(form.preferredGrades, item)"
        >
          {{ item }}
        </button>
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
h2 { margin: 0 0 12px; color: #111827; font-size: 18px; }
p { margin: 0; color: #6b7280; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; gap: 8px; color: #374151; font-size: 14px; }
.full { grid-column: 1 / -1; }
input, textarea { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; }
input:focus, textarea:focus { border-color: #10a881; box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.12); }
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chip { border: 1px solid #d1d5db; border-radius: 999px; padding: 8px 12px; background: #fff; cursor: pointer; }
.chip.active { background: rgba(16, 168, 129, 0.12); border-color: #10a881; color: #047857; }
.btn-primary { border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #10a881, #059669); cursor: pointer; }
.feedback { margin: 0; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 12px; padding: 12px; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
