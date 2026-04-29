<script setup lang="ts">
import { areaList } from '@vant/area-data'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { teacherApi } from '../../api/teacher'

const loading = ref(false)
const saving = ref(false)
const feedback = ref('')

const subjects = ['语文', '数学', '英语', '物理', '化学', '生物']
const grades = ['小学', '初中', '高中']
const teachingMethodOptions = [
  { label: '一对一', value: 'one_on_one' },
  { label: '小班(3-5人)', value: 'small_class' },
  { label: '线上', value: 'online' },
  { label: '线下', value: 'offline' }
]
const feeRangeOptions = [
  { label: '100元/小时以内', value: 'under_100' },
  { label: '100-150元/小时', value: '100_150' },
  { label: '150-200元/小时', value: '150_200' },
  { label: '200元/小时以上', value: 'over_200' }
]
const studentTypeOptions = ['基础薄弱', '基础中等', '基础扎实', '拔高冲刺']
const legacyStudentTypeMap: Record<string, string> = {
  待夯实基础: '基础薄弱',
  基础中等: '基础中等',
  基础良好: '基础扎实',
  基础优秀: '拔高冲刺'
}

const provinceList = areaList.province_list as Record<string, string>
const cityList = areaList.city_list as Record<string, string>
const countyList = areaList.county_list as Record<string, string>
const pinyinCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { sensitivity: 'base' })

const form = reactive({
  teacherName: '',
  phone: '',
  city: '',
  district: '',
  gender: 'male' as 'male' | 'female',
  wechat: '',
  bio: '',
  school: '',
  preferredSubjects: [] as string[],
  preferredGrades: [] as string[],
  teachingMethods: [] as string[],
  feeRange: '100_150' as 'under_100' | '100_150' | '150_200' | 'over_200',
  experienceYears: 0,
  teachingStyle: '',
  studentType: '',
  areas: [] as string[]
})

const selectedCityCode = ref('')
const selectedDistrictCode = ref('')
const cityKeyword = ref('')

const allCityOptions = computed(() => {
  return Object.entries(cityList)
    .map(([code, name]) => {
      const provinceCode = `${code.slice(0, 2)}0000`
      const provinceName = provinceList[provinceCode] || ''
      const displayName = name === '市辖区' || name === '县' ? provinceName : name
      return { code, name: displayName || name }
    })
    .sort((a, b) => pinyinCollator.compare(a.name, b.name) || Number(a.code) - Number(b.code))
})

const citySuggestions = computed(() => {
  const keyword = cityKeyword.value.trim().toLowerCase()
  if (!keyword) return allCityOptions.value
  return allCityOptions.value.filter((item) => item.name.toLowerCase().includes(keyword))
})

const districtOptions = computed(() => {
  if (!selectedCityCode.value) return []
  const prefix = selectedCityCode.value.slice(0, 4)
  return Object.entries(countyList)
    .filter(([code]) => code.startsWith(prefix))
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => Number(a.code) - Number(b.code))
})

watch(
  cityKeyword,
  () => {
    const input = cityKeyword.value.trim()
    const exact = allCityOptions.value.find((item) => item.name === input)
    if (exact) {
      if (selectedCityCode.value !== exact.code) {
        selectedCityCode.value = exact.code
      }
      return
    }
    selectedCityCode.value = ''
    form.city = input
    selectedDistrictCode.value = ''
  }
)

watch(
  selectedCityCode,
  () => {
    const city = allCityOptions.value.find((item) => item.code === selectedCityCode.value)
    form.city = city?.name || ''
    if (city && cityKeyword.value !== city.name) {
      cityKeyword.value = city.name
    }

    if (!districtOptions.value.some((item) => item.code === selectedDistrictCode.value)) {
      selectedDistrictCode.value = ''
    }
  }
)

watch(
  selectedDistrictCode,
  () => {
    const district = districtOptions.value.find((item) => item.code === selectedDistrictCode.value)
    form.district = district?.name || ''
  }
)

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
    form.wechat = data.wechat || ''
    form.bio = data.bio
    form.gender = data.gender === 'female' ? 'female' : 'male'
    form.school = data.school || ''
    form.preferredSubjects = Array.isArray(data.preferredSubjects) ? [...data.preferredSubjects] : []
    form.preferredGrades = Array.isArray(data.preferredGrades) ? [...data.preferredGrades] : []
    form.teachingMethods = Array.isArray(data.teachingMethods) ? [...data.teachingMethods] : []
    form.feeRange = (data.feeRange as 'under_100' | '100_150' | '150_200' | 'over_200') || '100_150'
    form.experienceYears = Number(data.experienceYears || 0)
    form.teachingStyle = data.teachingStyle || ''
    form.studentType = legacyStudentTypeMap[data.studentType || ''] || data.studentType || ''
    form.areas = Array.isArray(data.areas) ? [...data.areas] : []

    const cityName = data.city || ''
    const districtName = data.district || ''
    const city = allCityOptions.value.find((item) => item.name === cityName)
    selectedCityCode.value = city?.code || ''
    cityKeyword.value = city?.name || cityName
    form.city = city?.name || cityName

    const district = districtOptions.value.find((item) => item.name === districtName)
    selectedDistrictCode.value = district?.code || ''
    form.district = district?.name || ''

    if (!studentTypeOptions.includes(form.studentType)) {
      form.studentType = ''
    }
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
  if (!studentTypeOptions.includes(form.studentType)) {
    feedback.value = '请选择学生类型'
    return
  }
  if (!selectedCityCode.value || !selectedDistrictCode.value) {
    feedback.value = '请从下拉建议中选择有效的城市和区县'
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
          性别
          <select v-model="form.gender">
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </label>
        <label>
          城市
          <input v-model="cityKeyword" list="city-suggestions" type="text" placeholder="输入城市名进行模糊匹配" />
          <datalist id="city-suggestions">
            <option v-for="city in citySuggestions" :key="city.code" :value="city.name" />
          </datalist>
        </label>
        <label>
          区县
          <select v-model="selectedDistrictCode" :disabled="!selectedCityCode">
            <option value="">{{ selectedCityCode ? '请选择区县' : '请先选择城市' }}</option>
            <option v-for="district in districtOptions" :key="district.code" :value="district.code">{{ district.name }}</option>
          </select>
        </label>
        <label>
          微信号
          <input v-model="form.wechat" type="text" />
        </label>
        <label>
          教龄
          <input v-model.number="form.experienceYears" type="number" min="0" max="50" />
        </label>
        <label>
          毕业院校
          <input v-model="form.school" type="text" placeholder="如：北京师范大学" />
        </label>
        <label>
          教学风格
          <input v-model="form.teachingStyle" type="text" placeholder="如：鼓励式、结构化、启发式" />
        </label>
        <label>
          学生类型
          <select v-model="form.studentType">
            <option value="">请选择学生类型</option>
            <option v-for="studentType in studentTypeOptions" :key="studentType" :value="studentType">{{ studentType }}</option>
          </select>
        </label>
        <label>
          服务费区间
          <select v-model="form.feeRange">
            <option v-for="item in feeRangeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label>
          授课区域
          <input
            :value="form.areas.join('、')"
            type="text"
            placeholder="多个区域用逗号分隔"
            @input="form.areas = String(($event.target as HTMLInputElement).value).split(/[，,\s]+/).filter(Boolean)"
          />
        </label>
        <label class="full">
          个人简介
          <textarea v-model="form.bio" rows="4" placeholder="介绍教学经验、擅长提分方向、授课风格"></textarea>
        </label>
      </div>
    </article>

    <article class="card">
      <h2>授课方式</h2>
      <div class="chips">
        <button
          v-for="item in teachingMethodOptions"
          :key="item.value"
          class="chip"
          :class="{ active: form.teachingMethods.includes(item.value) }"
          @click="toggle(form.teachingMethods, item.value)"
        >
          {{ item.label }}
        </button>
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
input, textarea, select { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; background: #fff; }
input:focus, textarea:focus, select:focus { border-color: #10a881; box-shadow: 0 0 0 3px rgba(16, 168, 129, 0.12); }
select:disabled { background: #f3f4f6; color: #9ca3af; cursor: not-allowed; }
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chip { border: 1px solid #d1d5db; border-radius: 999px; padding: 8px 12px; background: #fff; cursor: pointer; }
.chip.active { background: rgba(16, 168, 129, 0.12); border-color: #10a881; color: #047857; }
.btn-primary { border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #10a881, #059669); cursor: pointer; }
.feedback { margin: 0; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 12px; padding: 12px; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
@media (max-width: 768px) {
  .page { gap: 10px; }
  .card { border-radius: 14px; padding: 16px; }
  .header { flex-direction: column; align-items: stretch; gap: 10px; }
  .btn-primary { width: 100%; min-height: 44px; }
  label { gap: 6px; font-size: 13px; }
  input, textarea, select { min-height: 42px; padding: 9px 10px; font-size: 14px; }
  .chip { min-height: 40px; padding: 8px 12px; }
}
</style>
