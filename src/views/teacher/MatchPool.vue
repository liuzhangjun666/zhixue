<script setup lang="ts">
import { areaList } from '@vant/area-data'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { teacherApi, type MatchStatus, type TeacherMatchDTO } from '../../api/teacher'

const loading = ref(false)
const actioningId = ref<number | null>(null)
const feedback = ref('')
const unlockedMap = reactive<Record<number, { phone: string; wechat: string; parentName: string }>>({})
const matches = ref<TeacherMatchDTO[]>([])
const tab = ref<'' | MatchStatus>('')

const provinceList = areaList.province_list as Record<string, string>
const cityList = areaList.city_list as Record<string, string>
const countyList = areaList.county_list as Record<string, string>

const filter = reactive({
  grade: '',
  subject: '',
  cityKeyword: '',
  cityCode: '',
  districtCode: '',
  budgetMin: '',
  budgetMax: ''
})

const cityOptions = computed(() => {
  return Object.entries(cityList).map(([code, name]) => {
    const provinceCode = `${code.slice(0, 2)}0000`
    const provinceName = provinceList[provinceCode] || ''
    const cityName = name === '市辖区' || name === '县' ? provinceName : name
    return { code, name: cityName || name }
  })
})

const citySuggestions = computed(() => {
  const keyword = filter.cityKeyword.trim().toLowerCase()
  if (!keyword) return cityOptions.value
  return cityOptions.value.filter((item) => item.name.toLowerCase().includes(keyword))
})

const districtOptions = computed(() => {
  if (!filter.cityCode) return []
  const prefix = filter.cityCode.slice(0, 4)
  return Object.entries(countyList)
    .filter(([code]) => code.startsWith(prefix))
    .map(([code, name]) => ({ code, name }))
})

watch(
  () => filter.cityKeyword,
  () => {
    const city = cityOptions.value.find((item) => item.name === filter.cityKeyword.trim())
    filter.cityCode = city?.code || ''
    if (!city) {
      filter.districtCode = ''
    }
  }
)

watch(
  () => filter.cityCode,
  () => {
    if (!districtOptions.value.some((item) => item.code === filter.districtCode)) {
      filter.districtCode = ''
    }
  }
)

const filtered = computed(() => {
  if (!tab.value) return matches.value
  return matches.value.filter((item) => item.status === tab.value)
})

const selectedCityName = computed(() => cityOptions.value.find((item) => item.code === filter.cityCode)?.name || '')
const selectedDistrictName = computed(() => districtOptions.value.find((item) => item.code === filter.districtCode)?.name || '')

const load = async () => {
  loading.value = true
  feedback.value = ''
  try {
    matches.value = await teacherApi.getMatches({
      status: tab.value || undefined,
      grade: filter.grade || undefined,
      subject: filter.subject || undefined,
      city: selectedCityName.value || undefined,
      district: selectedDistrictName.value || undefined,
      budgetMin: filter.budgetMin ? Number(filter.budgetMin) : undefined,
      budgetMax: filter.budgetMax ? Number(filter.budgetMax) : undefined
    })
  } catch (error) {
    feedback.value = (error as Error).message || '匹配池加载失败'
  } finally {
    loading.value = false
  }
}

const unlock = async (id: number, unlockType: 'phone' | 'wechat') => {
  actioningId.value = id
  feedback.value = ''
  try {
    const data = await teacherApi.unlockMatch(id, unlockType)
    unlockedMap[id] = { phone: data.phone, wechat: data.wechat, parentName: data.parentName }
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '解锁失败'
  } finally {
    actioningId.value = null
  }
}

const accept = async (id: number) => {
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.acceptMatch(id)
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '接受失败'
  } finally {
    actioningId.value = null
  }
}

const reject = async (id: number) => {
  actioningId.value = id
  feedback.value = ''
  try {
    await teacherApi.rejectMatch(id)
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '拒绝失败'
  } finally {
    actioningId.value = null
  }
}

const feedbackRematch = async (id: number) => {
  const reason = window.prompt('请输入不满意原因（如：风格不符/预算差距大/信息不符）', '风格不符')
  if (!reason) return
  actioningId.value = id
  feedback.value = ''
  try {
    const result = await teacherApi.feedbackMatch(id, reason)
    feedback.value = result.generated > 0 ? `已重新匹配，新增 ${result.generated} 条候选` : '已提交重匹配，暂未生成新候选'
    await load()
  } catch (error) {
    feedback.value = (error as Error).message || '重匹配失败'
  } finally {
    actioningId.value = null
  }
}

const copyText = async (value: string, label: string) => {
  if (!value) {
    feedback.value = `${label}为空，无法复制`
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    feedback.value = `${label}已复制`
  } catch {
    feedback.value = `${label}复制失败，请检查浏览器权限`
  }
}

const openWechat = async (wechat: string) => {
  await copyText(wechat, '微信号')
  window.open('weixin://', '_blank')
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="card header">
      <div>
        <h1>匹配池</h1>
        <p>查看系统推荐需求，按科目/年级/地区/预算筛选后解锁联系方式。</p>
      </div>
    </header>

    <article class="card filters">
      <label>
        年级
        <select v-model="filter.grade">
          <option value="">全部</option>
          <option value="小学">小学</option>
          <option value="初中">初中</option>
          <option value="高中">高中</option>
        </select>
      </label>
      <label>
        科目
        <input v-model="filter.subject" type="text" placeholder="如：数学" />
      </label>
      <label>
        城市
        <input v-model="filter.cityKeyword" list="match-city-suggestions" type="text" placeholder="输入城市名" />
        <datalist id="match-city-suggestions">
          <option v-for="city in citySuggestions" :key="city.code" :value="city.name" />
        </datalist>
      </label>
      <label>
        区县
        <select v-model="filter.districtCode" :disabled="!filter.cityCode">
          <option value="">{{ filter.cityCode ? '全部' : '请先选城市' }}</option>
          <option v-for="district in districtOptions" :key="district.code" :value="district.code">{{ district.name }}</option>
        </select>
      </label>
      <label>
        最低预算
        <input v-model="filter.budgetMin" type="number" min="0" placeholder="0" />
      </label>
      <label>
        最高预算
        <input v-model="filter.budgetMax" type="number" min="0" placeholder="不限" />
      </label>
      <div class="filter-actions">
        <button class="btn" :disabled="loading" @click="load">筛选</button>
        <button
          class="btn-ghost"
          :disabled="loading"
          @click="filter.grade='';filter.subject='';filter.cityKeyword='';filter.cityCode='';filter.districtCode='';filter.budgetMin='';filter.budgetMax='';load()"
        >
          重置
        </button>
      </div>
    </article>

    <article class="card tabs" v-if="!loading">
      <button :class="{ active: tab === '' }" @click="tab = ''; load()">全部</button>
      <button :class="{ active: tab === 'new' }" @click="tab = 'new'; load()">新推荐</button>
      <button :class="{ active: tab === 'unlocked' }" @click="tab = 'unlocked'; load()">已解锁</button>
      <button :class="{ active: tab === 'accepted' }" @click="tab = 'accepted'; load()">已接受</button>
    </article>

    <article class="card" v-if="loading">
      <p>匹配数据加载中...</p>
    </article>

    <div class="list" v-else-if="filtered.length > 0">
      <article class="card item" v-for="item in filtered" :key="item.id">
        <div class="top">
          <h2>{{ item.title }}</h2>
          <div class="tag-wrap">
            <span class="score">匹配分 {{ item.matchScore }}</span>
            <span class="status">{{ item.status }}</span>
          </div>
        </div>
        <div class="meta">
          <p><span>家长：</span>{{ item.parentName }}</p>
          <p><span>科目：</span>{{ item.subject }}</p>
          <p><span>年级：</span>{{ item.grade }}</p>
          <p><span>预算：</span>{{ item.budget }}</p>
          <p><span>地区：</span>{{ item.city || '未知' }}</p>
          <p><span>时间：</span>{{ item.schedule }}</p>
        </div>
        <div class="match-tips" v-if="Array.isArray(item.matchTips) && item.matchTips.length">
          <span class="tip" v-for="tip in item.matchTips" :key="`${item.id}-${tip}`">{{ tip }}</span>
        </div>
        <p class="hint" v-if="!item.unlockGranted">需双方都点击“接受需求”后才可解锁联系方式</p>

        <div class="contact" v-if="unlockedMap[item.id]">
          <div>
            手机号：{{ unlockedMap[item.id].phone }}
            <button class="text-btn" @click="copyText(unlockedMap[item.id].phone, '手机号')">复制</button>
          </div>
          <div>
            微信号：{{ unlockedMap[item.id].wechat || '未提供' }}
            <button class="text-btn" :disabled="!unlockedMap[item.id].wechat" @click="copyText(unlockedMap[item.id].wechat, '微信号')">复制</button>
            <button class="text-btn" :disabled="!unlockedMap[item.id].wechat" @click="openWechat(unlockedMap[item.id].wechat)">打开微信</button>
          </div>
        </div>

        <div class="actions">
          <button class="btn" :disabled="actioningId === item.id" @click="unlock(item.id, 'phone')">
            {{ actioningId === item.id ? '处理中...' : '解锁手机号' }}
          </button>
          <button class="btn-ghost" :disabled="actioningId === item.id" @click="unlock(item.id, 'wechat')">解锁微信</button>
          <button class="btn-ghost" :disabled="actioningId === item.id" @click="accept(item.id)">接受需求</button>
          <button class="btn-ghost" :disabled="actioningId === item.id" @click="feedbackRematch(item.id)">不满意重配</button>
          <button class="btn-danger" :disabled="actioningId === item.id" @click="reject(item.id)">拒绝</button>
        </div>
      </article>
    </div>

    <article class="card" v-else>
      <p>暂无推荐需求。</p>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 20px; }
.header h1 { margin: 0 0 8px; color: #111827; }
.header p { margin: 0; color: #6b7280; }
.filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.filters label { display: flex; flex-direction: column; gap: 6px; color: #374151; font-size: 14px; }
.filters input, .filters select { border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 10px; }
.filter-actions { display: flex; gap: 10px; align-items: flex-end; }
.tabs { display: flex; gap: 10px; }
.tabs button { border: 1px solid #d1d5db; border-radius: 999px; background: #fff; padding: 8px 12px; cursor: pointer; }
.tabs button.active { border-color: #10a881; color: #047857; background: rgba(16, 168, 129, 0.12); }
.list { display: flex; flex-direction: column; gap: 12px; }
.item h2 { margin: 0; font-size: 18px; color: #111827; }
.top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; }
.tag-wrap { display: inline-flex; gap: 8px; align-items: center; }
.score { border-radius: 999px; padding: 4px 10px; font-size: 12px; background: #ecfdf5; color: #047857; }
.status { border-radius: 999px; padding: 4px 10px; font-size: 12px; background: #eef2ff; color: #4338ca; }
.meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.meta p { margin: 0; color: #6b7280; font-size: 14px; }
.meta span { color: #111827; }
.match-tips { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
.tip { border-radius: 999px; padding: 4px 10px; font-size: 12px; background: #fff7ed; border: 1px solid #fdba74; color: #c2410c; }
.hint { margin: 10px 0 0; color: #b45309; font-size: 13px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 10px; }
.contact { margin-top: 10px; padding: 10px; border-radius: 10px; background: #f0fdf4; color: #065f46; display: flex; flex-direction: column; gap: 8px; }
.text-btn { border: none; background: transparent; color: #0ea5e9; cursor: pointer; margin-left: 8px; }
.actions { margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
.btn, .btn-ghost, .btn-danger { border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 600; }
.btn { background: #10a881; color: #fff; }
.btn-ghost { background: #eef2ff; color: #4338ca; }
.btn-danger { background: #fee2e2; color: #b91c1c; }
.feedback { margin: 0; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px; }
@media (max-width: 1100px) {
  .filters { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 900px) {
  .filters { grid-template-columns: 1fr; }
  .meta { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .page { gap: 10px; }
  .card { border-radius: 14px; padding: 16px; }
  .top { flex-direction: column; align-items: flex-start; gap: 8px; }
  .filter-actions { align-items: stretch; }
  .filter-actions .btn,
  .filter-actions .btn-ghost { flex: 1; min-height: 42px; }
  .tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 2px; }
  .tabs button { flex-shrink: 0; min-height: 40px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .actions .btn,
  .actions .btn-ghost,
  .actions .btn-danger { width: 100%; min-height: 42px; padding: 10px; }
}
@media (max-width: 520px) {
  .actions { grid-template-columns: 1fr; }
}
</style>
