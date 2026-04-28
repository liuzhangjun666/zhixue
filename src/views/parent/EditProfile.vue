<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { parentApi } from '../../api/parent'

interface ChildProfile {
  id: number
  name: string
  grade: string
  targetSubject: string
}

const profileForm = reactive({
  parentName: '',
  phone: '',
  city: '',
  bio: '',
  preferredGrade: '小学',
  preferredSubjects: [] as string[]
})

const primarySubjects = ['语文', '数学', '英语']
const middleHighSubjects = ['语文', '数学', '英语', '政治', '历史', '地理', '物理', '化学', '生物']

const availableSubjects = computed(() => {
  return profileForm.preferredGrade === '小学' ? primarySubjects : middleHighSubjects
})

const children = ref<ChildProfile[]>([])

const newChild = reactive({
  name: '',
  stage: '',
  grade: '',
  targetSubject: ''
})

const stageOptions = ['小学', '初中', '高中'] as const
const childGradeOptions = {
  小学: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
  初中: ['初一', '初二', '初三'],
  高中: ['高一', '高二', '高三']
}

const saving = ref(false)
const loading = ref(false)
const saveMessage = ref('')
const addFormRef = ref<HTMLElement | null>(null)
const openAddDropdown = ref<'stage' | 'grade' | 'subject' | null>(null)

const canSave = computed(() => {
  return profileForm.parentName.trim().length > 1 && /^1\d{10}$/.test(profileForm.phone) && children.value.length > 0
})

const toggleSubject = (subject: string) => {
  if (!availableSubjects.value.includes(subject)) return
  const index = profileForm.preferredSubjects.indexOf(subject)
  if (index >= 0) {
    profileForm.preferredSubjects.splice(index, 1)
  } else {
    profileForm.preferredSubjects.push(subject)
  }
}

const alignSubjectsByGrade = () => {
  profileForm.preferredSubjects = profileForm.preferredSubjects.filter((subject) => availableSubjects.value.includes(subject))
}

const childGradeList = computed(() => {
  if (!newChild.stage) return []
  return childGradeOptions[newChild.stage as keyof typeof childGradeOptions] || []
})

const childSubjectOptions = computed(() => {
  const stage = newChild.stage
  if (stage === '小学') return primarySubjects
  if (stage === '初中' || stage === '高中') return middleHighSubjects
  return []
})

const toggleAddDropdown = (key: 'stage' | 'grade' | 'subject') => {
  if ((key === 'grade' || key === 'subject') && !newChild.stage) return
  openAddDropdown.value = openAddDropdown.value === key ? null : key
}

const selectStage = (stage: (typeof stageOptions)[number]) => {
  newChild.stage = stage
  openAddDropdown.value = null
}

const selectGrade = (grade: string) => {
  newChild.grade = grade
  openAddDropdown.value = null
}

const selectSubject = (subject: string) => {
  newChild.targetSubject = subject
  openAddDropdown.value = null
}

const addChild = () => {
  if (!newChild.name.trim() || !newChild.stage.trim() || !newChild.grade.trim() || !newChild.targetSubject.trim()) {
    saveMessage.value = '请先填写完整的学生信息。'
    return
  }

  children.value.push({
    id: Date.now(),
    name: newChild.name.trim(),
    grade: newChild.grade.trim(),
    targetSubject: newChild.targetSubject.trim()
  })

  newChild.name = ''
  newChild.stage = ''
  newChild.grade = ''
  newChild.targetSubject = ''
  saveMessage.value = ''

  // 自动保存到后端数据库
  handleSave()
}

const removeChild = (id: number) => {
  children.value = children.value.filter((child) => child.id !== id)
  // 自动保存到后端数据库
  handleSave()
}

const handleSave = async () => {
  if (!canSave.value) {
    saveMessage.value = '请检查姓名、手机号和学生信息后再保存。'
    return
  }

  saving.value = true
  saveMessage.value = ''

  try {
    await parentApi.updateProfile({
      parentName: profileForm.parentName,
      phone: profileForm.phone,
      city: profileForm.city,
      bio: profileForm.bio,
      preferredGrade: profileForm.preferredGrade,
      preferredSubjects: profileForm.preferredSubjects,
      children: children.value
    })
    saveMessage.value = '资料已保存。'
  } catch (error) {
    saveMessage.value = (error as Error).message || '保存失败，请稍后重试。'
  } finally {
    saving.value = false
  }
}

const loadProfile = async () => {
  loading.value = true
  saveMessage.value = ''
  try {
    const data = await parentApi.getProfile()
    profileForm.parentName = data.parentName
    profileForm.phone = data.phone
    profileForm.city = data.city
    profileForm.bio = data.bio
    profileForm.preferredGrade = data.preferredGrade || '小学'
    profileForm.preferredSubjects = Array.isArray(data.preferredSubjects) ? data.preferredSubjects : []
    alignSubjectsByGrade()
    children.value = data.children || []
  } catch (error) {
    saveMessage.value = (error as Error).message || '加载资料失败。'
  } finally {
    loading.value = false
  }
}

watch(
  () => profileForm.preferredGrade,
  () => {
    alignSubjectsByGrade()
  }
)

watch(
  () => newChild.stage,
  () => {
    if (!childGradeList.value.includes(newChild.grade)) {
      newChild.grade = ''
    }
    if (!childSubjectOptions.value.includes(newChild.targetSubject)) {
      newChild.targetSubject = ''
    }
  }
)

const handleDocumentClick = (event: MouseEvent) => {
  const target = event.target as Node | null
  if (!target || !addFormRef.value) return
  if (!addFormRef.value.contains(target)) {
    openAddDropdown.value = null
  }
}

onMounted(() => {
  loadProfile()
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<template>
  <section class="module-page">
    <header class="module-header">
      <div>
        <h1>编辑资料</h1>
        <p>维护家长信息、学生档案和偏好科目。</p>
      </div>
      <button class="btn-primary" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中...' : '保存资料' }}
      </button>
    </header>

    <article class="module-card" v-if="loading">
      <p>资料加载中...</p>
    </article>

    <div class="card-grid" v-else>
      <article class="module-card">
        <h2>家长信息</h2>
        <div class="field-grid">
          <label class="field">
            <span>家长昵称</span>
            <input v-model="profileForm.parentName" type="text" />
          </label>
          <label class="field">
            <span>手机号</span>
            <input v-model="profileForm.phone" type="tel" maxlength="11" />
          </label>
          <label class="field">
            <span>所在城市</span>
            <input v-model="profileForm.city" type="text" />
          </label>
          <label class="field field-full">
            <span>需求说明</span>
            <textarea v-model="profileForm.bio" rows="3" />
          </label>
        </div>
      </article>

      <article class="module-card">
        <h2>学生档案</h2>
        <div class="add-child-form" ref="addFormRef">
          <input v-model="newChild.name" type="text" placeholder="学生姓名" />

          <div class="dropdown-field" :class="{ open: openAddDropdown === 'stage' }">
            <button type="button" class="dropdown-trigger" @click.stop="toggleAddDropdown('stage')">
              <span>{{ newChild.stage || '学段' }}</span>
              <span class="arrow">▾</span>
            </button>
            <ul class="dropdown-options" v-if="openAddDropdown === 'stage'">
              <li
                v-for="stage in stageOptions"
                :key="stage"
                class="dropdown-option"
                :class="{ selected: newChild.stage === stage }"
                @click.stop="selectStage(stage)"
              >
                {{ stage }}
              </li>
            </ul>
          </div>

          <div class="dropdown-field" :class="{ open: openAddDropdown === 'grade', disabled: !newChild.stage }">
            <button type="button" class="dropdown-trigger" @click.stop="toggleAddDropdown('grade')" :disabled="!newChild.stage">
              <span>{{ newChild.grade || '年级' }}</span>
              <span class="arrow">▾</span>
            </button>
            <ul class="dropdown-options" v-if="openAddDropdown === 'grade' && newChild.stage">
              <li
                v-for="grade in childGradeList"
                :key="grade"
                class="dropdown-option"
                :class="{ selected: newChild.grade === grade }"
                @click.stop="selectGrade(grade)"
              >
                {{ grade }}
              </li>
            </ul>
          </div>

          <div class="dropdown-field" :class="{ open: openAddDropdown === 'subject', disabled: !newChild.stage }">
            <button type="button" class="dropdown-trigger" @click.stop="toggleAddDropdown('subject')" :disabled="!newChild.stage">
              <span>{{ newChild.targetSubject || '目标科目' }}</span>
              <span class="arrow">▾</span>
            </button>
            <ul class="dropdown-options" v-if="openAddDropdown === 'subject' && newChild.stage">
              <li
                v-for="subject in childSubjectOptions"
                :key="subject"
                class="dropdown-option"
                :class="{ selected: newChild.targetSubject === subject }"
                @click.stop="selectSubject(subject)"
              >
                {{ subject }}
              </li>
            </ul>
          </div>

          <button class="btn-secondary" @click="addChild">新增学生</button>
        </div>

        <div class="child-list">
          <div v-for="child in children" :key="child.id" class="child-item">
            <div>
              <strong>{{ child.name }}</strong>
              <p>{{ child.grade }} · 目标科目：{{ child.targetSubject }}</p>
            </div>
            <button class="btn-link-danger" @click="removeChild(child.id)">移除</button>
          </div>
        </div>
      </article>
    </div>

    <article class="module-card">
      <h2>授课偏好</h2>
      <div class="field-grid">
        <label class="field">
          <span>主要学段</span>
          <select v-model="profileForm.preferredGrade">
            <option>小学</option>
            <option>初中</option>
            <option>高中</option>
          </select>
        </label>
      </div>

      <div class="chip-group">
        <button
          v-for="subject in availableSubjects"
          :key="subject"
          class="chip"
          :class="{ selected: profileForm.preferredSubjects.includes(subject) }"
          @click="toggleSubject(subject)"
        >
          {{ subject }}
        </button>
      </div>
    </article>

    <p class="feedback" :class="{ error: saveMessage.includes('请') }" v-if="saveMessage">{{ saveMessage }}</p>
  </section>
</template>

<style scoped>
.module-page {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.module-header {
  background: #ffffff;
  border: 1px solid #e5e5ea;
  border-radius: 20px;
  padding: 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

h1 {
  font-size: 28px;
  color: #1d1d1f;
  margin: 0 0 8px;
}

h2 {
  font-size: 20px;
  color: #1d1d1f;
  margin-bottom: 16px;
}

p {
  color: #6b7280;
}

.card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.module-card {
  background: #ffffff;
  border: 1px solid #e5e5ea;
  border-radius: 20px;
  padding: 24px;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  color: #6b7280;
  font-size: 13px;
}

.field-full {
  grid-column: 1 / -1;
}

input,
textarea,
select {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  background: #fff;
}

input:focus,
textarea:focus,
select:focus {
  border-color: #5e5ce6;
  box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.12);
}

.child-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.child-item {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.child-item p {
  margin-top: 4px;
  font-size: 13px;
}

.add-child-form {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1.2fr auto;
  gap: 12px;
  margin-bottom: 8px;
  align-items: center;
}

.dropdown-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.dropdown-trigger {
  height: 46px;
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #111827;
  white-space: nowrap;
}

.dropdown-trigger:focus {
  border-color: #5e5ce6;
  box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.12);
}

.dropdown-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.arrow {
  font-size: 12px;
  color: #6b7280;
}

.dropdown-options {
  list-style: none;
  margin: 0;
  padding: 4px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #fff;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
}

.dropdown-option {
  height: 36px;
  border-radius: 8px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 14px;
  color: #111827;
  white-space: nowrap;
}

.dropdown-option:hover {
  background: #f3f4f6;
}

.dropdown-option.selected {
  background: rgba(94, 92, 230, 0.1);
  color: #4f46e5;
}

.dropdown-field.disabled .dropdown-trigger {
  background: #f9fafb;
}

.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.chip:hover {
  border-color: #5e5ce6;
}

.chip.selected {
  background: rgba(94, 92, 230, 0.1);
  border-color: #5e5ce6;
  color: #5e5ce6;
}

.btn-primary,
.btn-secondary {
  border: none;
  border-radius: 12px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  color: #fff;
  background: linear-gradient(135deg, #5e5ce6, #4f46e5);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: default;
}

.btn-secondary {
  background: #1f2937;
  color: #fff;
}

.btn-link-danger {
  border: none;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
}

.feedback {
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  color: #0f766e;
  border-radius: 12px;
  padding: 12px;
  margin: 0;
}

.feedback.error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

@media (max-width: 992px) {
  .card-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .add-child-form {
    grid-template-columns: 1fr;
  }
}
</style>
