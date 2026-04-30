<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { parentApi, type ParentRequestDTO, type RequestStatus } from '../../api/parent'
import Modal from '../../components/Modal.vue'

const router = useRouter()
const route = useRoute()

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '新推荐' },
  { key: 'accepted', label: '已接受' },
  { key: 'rejected', label: '已拒绝' }
] as const

const activeTab = ref<(typeof tabs)[number]['key']>('all')
const requestStatusTabs = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'matching', label: '匹配中' },
  { key: 'scheduled', label: '已约课' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' }
] as const
const activeRequestStatusTab = ref<(typeof requestStatusTabs)[number]['key']>('all')

const requests = ref<ParentRequestDTO[]>([])
const selectedRequestId = ref<number | null>(null)
type RequestCandidate = {
  matchId: number
  teacherName: string
  matchScore: number
  status: string
  parentAcceptStatus: 'pending' | 'accepted' | 'rejected'
  teacherAcceptStatus: 'pending' | 'accepted' | 'rejected'
  unlockGranted: boolean
  teacherPhone: string
  teacherWechat: string
  teacherCity: string
  teacherIntro: string
  teacherSubjects: string[]
  teacherGrades: string[]
  teacherExperienceYears: number
  decisionMessage: string
}
const matchCandidatesMap = ref<Record<number, RequestCandidate[]>>({})
const loading = ref(false)
const actioningId = ref<number | null>(null)
const actioningMatchId = ref<number | null>(null)
const feedback = ref('')

const showCreateModal = ref(false)
const isSubmitting = ref(false)
const CUSTOM_OPTION = '__custom__'
const subjectOptions = ['数学', '英语', '语文', '物理', '化学', '生物']
const gradeOptions = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三', '高一', '高二', '高三']
const budgetOptions = ['100-150 元/小时', '150-200 元/小时', '200-300 元/小时', '300+ 元/小时']
const scheduleOptions = ['周一到周五 晚上', '周六 上午', '周六 下午', '周日 上午', '周日 下午']
const customSubject = ref('')
const customGrade = ref('')
const customBudget = ref('')
const customSchedule = ref('')
const newReq = ref({
  title: '',
  subject: '',
  grade: '',
  budget: '',
  schedule: '',
  description: '',
  teacherName: ''
})

const normalizeFieldValue = (value: string, options: string[], setCustom: (v: string) => void) => {
  const text = String(value || '').trim()
  if (!text) return ''
  if (options.includes(text)) return text
  setCustom(text)
  return CUSTOM_OPTION
}

const requestMatchesStatus = (item: ParentRequestDTO, statusKey: (typeof requestStatusTabs)[number]['key']) => {
  if (statusKey === 'all') return true
  return item.status === statusKey
}

const filteredRequestCards = computed(() => {
  return requests.value.filter((item) => requestMatchesStatus(item, activeRequestStatusTab.value))
})

const selectedRequest = computed(() => {
  if (!filteredRequestCards.value.length) return null
  if (selectedRequestId.value == null) return filteredRequestCards.value[0]
  return filteredRequestCards.value.find((item) => item.id === selectedRequestId.value) || filteredRequestCards.value[0]
})

const candidateMatchesTab = (row: RequestCandidate, tabKey: (typeof tabs)[number]['key']) => {
  if (tabKey === 'all') return true
  if (tabKey === 'new') {
    const rejected = row.status === 'rejected' || row.parentAcceptStatus === 'rejected' || row.teacherAcceptStatus === 'rejected'
    const accepted = row.unlockGranted || row.parentAcceptStatus === 'accepted' || row.teacherAcceptStatus === 'accepted'
    return !rejected && !accepted
  }
  if (tabKey === 'accepted') {
    return row.unlockGranted || row.parentAcceptStatus === 'accepted' || row.teacherAcceptStatus === 'accepted'
  }
  if (tabKey === 'rejected') {
    return row.status === 'rejected' || row.parentAcceptStatus === 'rejected' || row.teacherAcceptStatus === 'rejected'
  }
  return false
}

const hasTabCandidate = (requestId: number, tabKey: (typeof tabs)[number]['key']) => {
  const rows = getRequestCandidates(requestId)
  if (!rows.length) return false
  return rows.some((row) => candidateMatchesTab(row, tabKey))
}

const filteredRequests = computed(() => {
  if (!selectedRequest.value) return []
  if (activeTab.value === 'all') return [selectedRequest.value]
  return hasTabCandidate(selectedRequest.value.id, activeTab.value) ? [selectedRequest.value] : []
})

const getRequestCandidates = (requestId: number) => matchCandidatesMap.value[requestId] || []
const getDisplayedCandidates = (requestId: number) => {
  const rows = getRequestCandidates(requestId)
  if (activeTab.value === 'all') return rows
  return rows.filter((row) => candidateMatchesTab(row, activeTab.value))
}
const hasCandidates = (item: ParentRequestDTO) =>
  (item.status === 'matching' || item.status === 'pending') && getDisplayedCandidates(item.id).length > 0
const canAcceptTeacher = (candidate: RequestCandidate) => candidate.parentAcceptStatus !== 'accepted' && candidate.status !== 'rejected'
const canRejectTeacher = (candidate: RequestCandidate) => candidate.parentAcceptStatus !== 'accepted' && candidate.status !== 'rejected'
const canRematchTeacher = (candidate: RequestCandidate) => candidate.parentAcceptStatus !== 'accepted' && candidate.status !== 'rejected'
const resolveCandidateStatus = (candidate: RequestCandidate) => {
  if (candidate.unlockGranted) return '已解锁'
  if (candidate.status === 'rejected' || candidate.parentAcceptStatus === 'rejected' || candidate.teacherAcceptStatus === 'rejected') return '已拒绝'
  if (candidate.parentAcceptStatus === 'accepted' && candidate.teacherAcceptStatus === 'accepted') return '已接受'
  if (candidate.parentAcceptStatus === 'accepted') return '我已接受'
  if (candidate.teacherAcceptStatus === 'accepted') return '老师已接受'
  return '待确认'
}
const candidateStatusClass = (candidate: RequestCandidate) => {
  const status = resolveCandidateStatus(candidate)
  if (status === '已拒绝') return 'is-rejected'
  if (status === '已解锁' || status === '已接受') return 'is-accepted'
  return 'is-pending'
}
const resolveCandidateHint = (candidate: RequestCandidate) => {
  if (candidate.decisionMessage) return candidate.decisionMessage
  if (candidate.unlockGranted) return '双方都已接受，联系方式已自动开放。'
  if (candidate.parentAcceptStatus === 'accepted') return '你已接受，等待老师确认。'
  if (candidate.teacherAcceptStatus === 'accepted') return '老师已接受，等待你确认。'
  return '可选择接受或拒绝该老师。'
}

const countByTab = (tabKey: (typeof tabs)[number]['key']) => {
  if (!selectedRequest.value) return 0
  const rows = getRequestCandidates(selectedRequest.value.id)
  if (!rows.length) return 0
  return rows.filter((row) => candidateMatchesTab(row, tabKey)).length
}

const countByRequestStatus = (statusKey: (typeof requestStatusTabs)[number]['key']) => {
  return requests.value.filter((item) => requestMatchesStatus(item, statusKey)).length
}

const currentRequestUnlockStats = computed(() => {
  if (!selectedRequest.value) {
    return { total: 0, teacherAccepted: 0, parentAccepted: 0, unlocked: 0 }
  }
  const rows = getRequestCandidates(selectedRequest.value.id)
  return {
    total: rows.length,
    teacherAccepted: rows.filter((row) => row.teacherAcceptStatus === 'accepted').length,
    parentAccepted: rows.filter((row) => row.parentAcceptStatus === 'accepted').length,
    unlocked: rows.filter((row) => row.unlockGranted).length
  }
})

const pendingUnlockFromTeachers = computed(() => {
  if (!selectedRequest.value) return []
  return getRequestCandidates(selectedRequest.value.id).filter(
    (row) => row.teacherAcceptStatus === 'accepted' && row.parentAcceptStatus === 'pending'
  )
})

const statusTextMap: Record<RequestStatus, string> = {
  pending: '待处理',
  matching: '匹配中',
  scheduled: '已约课',
  completed: '已完成',
  cancelled: '已取消'
}

const statusClassMap: Record<RequestStatus, string> = {
  pending: 'status-pending',
  matching: 'status-matching',
  scheduled: 'status-scheduled',
  completed: 'status-completed',
  cancelled: 'status-cancelled'
}

const cancelRequest = async (id: number) => {
  const target = requests.value.find((item) => item.id === id)
  if (!target) return
  const previousStatus = target.status
  actioningId.value = id
  feedback.value = ''
  target.status = 'cancelled'
  try {
    await parentApi.updateRequestStatus(id, 'cancelled')
  } catch (error) {
    target.status = previousStatus
    feedback.value = (error as Error).message || '取消失败，请稍后重试。'
  } finally {
    actioningId.value = null
  }
}

const completeRequest = async (id: number) => {
  const target = requests.value.find((item) => item.id === id)
  if (!target) return
  const previousStatus = target.status
  actioningId.value = id
  feedback.value = ''
  target.status = 'completed'
  try {
    await parentApi.updateRequestStatus(id, 'completed')
  } catch (error) {
    target.status = previousStatus
    feedback.value = (error as Error).message || '操作失败，请稍后重试。'
  } finally {
    actioningId.value = null
  }
}

const acceptTeacher = async (matchId: number) => {
  actioningMatchId.value = matchId
  feedback.value = ''
  try {
    await parentApi.acceptMatch(matchId)
    feedback.value = '已接受该老师，若老师也接受将自动开放联系方式。'
    await loadRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '接受老师失败，请稍后重试。'
  } finally {
    actioningMatchId.value = null
  }
}

const rejectTeacher = async (matchId: number) => {
  actioningMatchId.value = matchId
  feedback.value = ''
  try {
    await parentApi.rejectMatch(matchId)
    feedback.value = '已拒绝该老师。'
    await loadRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '拒绝老师失败，请稍后重试。'
  } finally {
    actioningMatchId.value = null
  }
}

const rematchTeacher = async (matchId: number) => {
  const reason = window.prompt('请输入不满意原因（如：风格不符/预算差距大/信息不符）', '风格不符')
  if (!reason) return
  actioningMatchId.value = matchId
  feedback.value = ''
  try {
    const result = await parentApi.feedbackMatch(matchId, reason)
    feedback.value = result.generated > 0 ? `已重新匹配，新增 ${result.generated} 条候选` : '已提交重匹配，暂未生成新候选'
    await loadRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '重配失败，请稍后重试。'
  } finally {
    actioningMatchId.value = null
  }
}

const copyText = async (value: string, label: string) => {
  if (!value) {
    feedback.value = `${label}为空，暂不可复制。`
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    feedback.value = `${label}已复制。`
  } catch {
    feedback.value = `${label}复制失败，请检查浏览器权限。`
  }
}

const openWechat = async (wechat: string) => {
  await copyText(wechat, '微信号')
  window.open('weixin://', '_blank')
}

const loadRequests = async () => {
  loading.value = true
  feedback.value = ''
  try {
    const [requestList, matchListRaw] = await Promise.all([parentApi.getRequests(), parentApi.getMatches()])
    requests.value = requestList
    if (!requestList.length) {
      selectedRequestId.value = null
    } else if (selectedRequestId.value == null || !requestList.some((item) => item.id === selectedRequestId.value)) {
      selectedRequestId.value = requestList[0].id
    }
    const grouped: Record<number, RequestCandidate[]> = {}
    for (const raw of Array.isArray(matchListRaw) ? matchListRaw : []) {
      const requestId = Number((raw as any).requestId || (raw as any).request_id || 0)
      if (!requestId) continue
      const row: RequestCandidate = {
        matchId: Number((raw as any).id || 0),
        teacherName: String((raw as any).teacherName || (raw as any).teacher_name || '老师'),
        matchScore: Number((raw as any).matchScore || (raw as any).match_score || 0),
        status: String((raw as any).status || ''),
        parentAcceptStatus: String((raw as any).parentAcceptStatus || (raw as any).parent_accept_status || 'pending') as RequestCandidate['parentAcceptStatus'],
        teacherAcceptStatus: String((raw as any).teacherAcceptStatus || (raw as any).teacher_accept_status || 'pending') as RequestCandidate['teacherAcceptStatus'],
        unlockGranted: Boolean((raw as any).unlockGranted || (raw as any).unlock_granted),
        teacherPhone: String((raw as any).teacherPhone || (raw as any).teacher_phone || ''),
        teacherWechat: String((raw as any).teacherWechat || (raw as any).teacher_wechat || ''),
        teacherCity: String((raw as any).teacherCity || (raw as any).teacher_city || ''),
        teacherIntro: String((raw as any).teacherIntro || (raw as any).teacher_intro || ''),
        teacherSubjects: Array.isArray((raw as any).teacherSubjects)
          ? (raw as any).teacherSubjects.map((x: unknown) => String(x))
          : [],
        teacherGrades: Array.isArray((raw as any).teacherGrades)
          ? (raw as any).teacherGrades.map((x: unknown) => String(x))
          : [],
        teacherExperienceYears: Number((raw as any).teacherExperienceYears || (raw as any).teacher_experience_years || 0),
        decisionMessage: String((raw as any).decisionMessage || (raw as any).decision_message || '')
      }
      if (!grouped[requestId]) grouped[requestId] = []
      grouped[requestId].push(row)
    }
    Object.keys(grouped).forEach((key) => {
      grouped[Number(key)] = grouped[Number(key)]
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 3)
    })
    matchCandidatesMap.value = grouped
  } catch (error) {
    feedback.value = (error as Error).message || '请求列表加载失败。'
  } finally {
    loading.value = false
  }
}

const submitNewRequest = async () => {
  if (!newReq.value.title.trim()) {
    feedback.value = '请输入需求标题'
    return
  }
  const payload = {
    ...newReq.value,
    subject: newReq.value.subject === CUSTOM_OPTION ? customSubject.value.trim() : newReq.value.subject,
    grade: newReq.value.grade === CUSTOM_OPTION ? customGrade.value.trim() : newReq.value.grade,
    budget: newReq.value.budget === CUSTOM_OPTION ? customBudget.value.trim() : newReq.value.budget,
    schedule: newReq.value.schedule === CUSTOM_OPTION ? customSchedule.value.trim() : newReq.value.schedule
  }
  isSubmitting.value = true
  feedback.value = ''
  try {
    await parentApi.createRequest(payload)
    showCreateModal.value = false
    newReq.value = { title: '', subject: '', grade: '', budget: '', schedule: '', description: '', teacherName: '' }
    customSubject.value = ''
    customGrade.value = ''
    customBudget.value = ''
    customSchedule.value = ''
    loadRequests()
  } catch (error) {
    feedback.value = (error as Error).message || '新建请求失败'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  if (route.query.from === 'discover') {
    const teacherName = typeof route.query.teacherName === 'string' ? route.query.teacherName : ''
    const subject = typeof route.query.subject === 'string' ? route.query.subject : ''
    newReq.value = {
      title: teacherName ? `预约${teacherName}的辅导` : '',
      subject: normalizeFieldValue(subject, subjectOptions, (v) => (customSubject.value = v)),
      grade: '',
      budget: '',
      schedule: '',
      description: teacherName ? `来自发现页，意向老师：${teacherName}` : '',
      teacherName
    }
    showCreateModal.value = true
  }
  loadRequests()
})
</script>

<template>
  <section class="module-page">
    <header class="module-header">
      <div class="header-left">
        <button class="btn-icon-back" @click="router.push('/parent-center')">
          <ArrowLeft :size="20" />
        </button>
        <div>
          <h1>我的请求</h1>
          <p>管理家教需求，跟踪匹配、约课和完成状态。</p>
        </div>
      </div>
      <button class="btn-primary" @click="showCreateModal = true">新建请求</button>
    </header>

    <article class="empty-card" v-if="loading">
      <p>请求列表加载中...</p>
    </article>

    <div class="request-board" v-if="!loading && requests.length > 0">
      <div class="request-status-tabs">
        <button
          v-for="tab in requestStatusTabs"
          :key="tab.key"
          class="request-status-item"
          :class="{ active: activeRequestStatusTab === tab.key }"
          @click="activeRequestStatusTab = tab.key"
        >
          {{ tab.label }}
          <span class="tab-count" v-if="tab.key !== 'all'">
            {{ countByRequestStatus(tab.key) }}
          </span>
        </button>
      </div>
      <div class="request-cards" v-if="filteredRequestCards.length > 0">
        <article
          class="request-brief-card"
          :class="{ selected: selectedRequest?.id === item.id }"
          v-for="item in filteredRequestCards"
          :key="`req-${item.id}`"
          @click="selectedRequestId = item.id"
        >
          <div class="card-head">
            <h2>{{ item.title }}</h2>
            <span class="status-tag" :class="statusClassMap[item.status]">{{ statusTextMap[item.status] }}</span>
          </div>
          <div class="meta-grid">
            <p><span>科目：</span>{{ item.subject }}</p>
            <p><span>年级：</span>{{ item.grade }}</p>
            <p><span>预算：</span>{{ item.budget }}</p>
            <p><span>时间：</span>{{ item.schedule }}</p>
            <p><span>创建：</span>{{ item.createdAt }}</p>
            <p><span>老师：</span>{{ item.teacherName || '待匹配' }}</p>
          </div>
        </article>
      </div>
      <p class="request-board-empty" v-else>当前筛选下暂无请求</p>
    </div>

    <div class="tabs" v-if="!loading && selectedRequest">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span class="tab-count" v-if="tab.key !== 'all'">
          {{ countByTab(tab.key) }}
        </span>
      </button>
    </div>

    <article class="progress-card" v-if="!loading && selectedRequest">
      <span>老师已接受：{{ currentRequestUnlockStats.teacherAccepted }}/{{ currentRequestUnlockStats.total }}</span>
      <span>你已接受：{{ currentRequestUnlockStats.parentAccepted }}/{{ currentRequestUnlockStats.total }}</span>
      <span>已解锁联系方式/微信：{{ currentRequestUnlockStats.unlocked }}/{{ currentRequestUnlockStats.total }}</span>
    </article>

    <article class="intent-list" v-if="!loading && pendingUnlockFromTeachers.length > 0">
      <h3>这些老师想和你互换联系方式</h3>
      <p>对方已接受，等你确认后将自动解锁手机号和微信号。</p>
      <div class="intent-tags">
        <span class="intent-tag" v-for="item in pendingUnlockFromTeachers" :key="`parent-intent-${item.matchId}`">
          {{ item.teacherName }}
        </span>
      </div>
    </article>

    <div class="request-list" v-if="!loading && filteredRequests.length > 0">
      <article class="request-card" v-for="item in filteredRequests" :key="item.id">
        <div class="card-head" v-if="!hasCandidates(item)">
          <h2>{{ item.title }}</h2>
          <span class="status-tag" :class="statusClassMap[item.status]">{{ statusTextMap[item.status] }}</span>
        </div>

        <div class="meta-grid" v-if="!hasCandidates(item)">
          <p><span>科目：</span>{{ item.subject }}</p>
          <p><span>年级：</span>{{ item.grade }}</p>
          <p><span>预算：</span>{{ item.budget }}</p>
          <p><span>时间：</span>{{ item.schedule }}</p>
          <p><span>创建：</span>{{ item.createdAt }}</p>
          <p><span>老师：</span>{{ item.teacherName || '待匹配' }}</p>
        </div>
        <div class="candidate-box" v-if="hasCandidates(item)">
          <div class="candidate-list">
            <article class="candidate-item" v-for="candidate in getDisplayedCandidates(item.id)" :key="`${item.id}-${candidate.matchId}`">
              <div class="candidate-head">
                <strong>{{ item.title }}</strong>
                <div class="candidate-tag-wrap">
                  <span class="candidate-chip">匹配分 {{ candidate.matchScore }}</span>
                  <span class="candidate-status" :class="candidateStatusClass(candidate)">{{ candidate.status || 'new' }}</span>
                </div>
              </div>
              <p class="candidate-meta"><span>老师：</span>{{ candidate.teacherName }}</p>
              <p class="candidate-meta"><span>科目：</span>{{ item.subject }}</p>
              <p class="candidate-meta"><span>年级：</span>{{ item.grade }}</p>
              <p class="candidate-meta"><span>预算：</span>{{ item.budget }}</p>
              <p class="candidate-meta"><span>地区：</span>{{ candidate.teacherCity || '未知' }}</p>
              <p class="candidate-meta"><span>时间：</span>{{ item.schedule }}</p>
              <p class="candidate-meta"><span>简介：</span>{{ candidate.teacherIntro || '暂无简介' }}</p>
              <p class="candidate-hint" :class="{ rejected: candidateStatusClass(candidate) === 'is-rejected' }">{{ resolveCandidateHint(candidate) }}</p>
              <div class="candidate-contact" v-if="candidate.unlockGranted">
                <div>
                  手机号：{{ candidate.teacherPhone || '未提供' }}
                  <button class="inline-action" :disabled="!candidate.teacherPhone" @click="copyText(candidate.teacherPhone, '手机号')">复制</button>
                </div>
                <div>
                  微信号：{{ candidate.teacherWechat || '未提供' }}
                  <button class="inline-action" :disabled="!candidate.teacherWechat" @click="copyText(candidate.teacherWechat, '微信号')">复制</button>
                  <button class="inline-action" :disabled="!candidate.teacherWechat" @click="openWechat(candidate.teacherWechat || '')">打开微信</button>
                </div>
              </div>
              <div class="candidate-actions">
                <button class="btn-ghost" v-if="canAcceptTeacher(candidate)" :disabled="actioningMatchId === candidate.matchId" @click="acceptTeacher(candidate.matchId)">
                  {{ actioningMatchId === candidate.matchId ? '处理中...' : '接受需求' }}
                </button>
                <button class="btn-ghost" v-if="canRematchTeacher(candidate)" :disabled="actioningMatchId === candidate.matchId" @click="rematchTeacher(candidate.matchId)">
                  不满意重配
                </button>
                <button class="btn-danger-light candidate-reject" v-if="canRejectTeacher(candidate)" :disabled="actioningMatchId === candidate.matchId" @click="rejectTeacher(candidate.matchId)">
                  拒绝
                </button>
              </div>
            </article>
          </div>
        </div>

        <div class="card-actions" v-if="!hasCandidates(item)">
          <button class="btn-secondary" v-if="item.status === 'matching' || item.status === 'pending'" @click="cancelRequest(item.id)" :disabled="actioningId === item.id">
            取消请求
          </button>
          <button class="btn-secondary" v-if="item.status === 'scheduled'" @click="completeRequest(item.id)" :disabled="actioningId === item.id">
            标记完成
          </button>
          <button class="btn-ghost" @click="router.push(`/parent/requests/${item.id}`)">查看详情</button>
        </div>
      </article>
    </div>

    <article class="empty-card" v-else-if="!loading">
      <h3>{{ requests.length > 0 ? '当前请求在该筛选下暂无匹配老师' : '你还没有家教请求' }}</h3>
      <p>{{ requests.length > 0 ? '可切换筛选标签或切换请求查看。' : '点击上方“新建请求”开始匹配老师。' }}</p>
    </article>

    <p class="feedback" v-if="feedback">{{ feedback }}</p>

    <!-- 新建请求弹窗 -->
    <Modal :show="showCreateModal" title="新建家教请求" @close="showCreateModal = false">
      <div class="form-grid">
        <label class="field">
          <span>需求标题</span>
          <input v-model="newReq.title" type="text" placeholder="例如：四年级数学专项提升" />
        </label>
        <label class="field">
          <span>辅导科目</span>
          <select v-model="newReq.subject">
            <option value="">请选择科目</option>
            <option v-for="item in subjectOptions" :key="item" :value="item">{{ item }}</option>
            <option :value="CUSTOM_OPTION">其他（手动输入）</option>
          </select>
          <input v-if="newReq.subject === CUSTOM_OPTION" v-model="customSubject" type="text" placeholder="请输入科目" />
        </label>
        <label class="field">
          <span>学生年级</span>
          <select v-model="newReq.grade">
            <option value="">请选择年级</option>
            <option v-for="item in gradeOptions" :key="item" :value="item">{{ item }}</option>
            <option :value="CUSTOM_OPTION">其他（手动输入）</option>
          </select>
          <input v-if="newReq.grade === CUSTOM_OPTION" v-model="customGrade" type="text" placeholder="请输入年级" />
        </label>
        <label class="field">
          <span>可接受预算</span>
          <select v-model="newReq.budget">
            <option value="">请选择预算</option>
            <option v-for="item in budgetOptions" :key="item" :value="item">{{ item }}</option>
            <option :value="CUSTOM_OPTION">其他（手动输入）</option>
          </select>
          <input v-if="newReq.budget === CUSTOM_OPTION" v-model="customBudget" type="text" placeholder="请输入预算" />
        </label>
        <label class="field field-full">
          <span>期望时间</span>
          <select v-model="newReq.schedule">
            <option value="">请选择期望时间</option>
            <option v-for="item in scheduleOptions" :key="item" :value="item">{{ item }}</option>
            <option :value="CUSTOM_OPTION">其他（手动输入）</option>
          </select>
          <input v-if="newReq.schedule === CUSTOM_OPTION" v-model="customSchedule" type="text" placeholder="请输入期望时间" />
        </label>
        <label class="field field-full">
          <span>补充说明</span>
          <input v-model="newReq.description" type="text" placeholder="孩子情况、目标或意向老师" />
        </label>
      </div>
      <template #footer>
        <button class="btn-ghost" @click="showCreateModal = false">取消</button>
        <button class="btn-primary" @click="submitNewRequest" :disabled="isSubmitting">
          {{ isSubmitting ? '提交中...' : '确认新建' }}
        </button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.module-page {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.module-header,
.request-board,
.tabs,
.request-card,
.empty-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-icon-back {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F5F5F7;
  color: #1D1D1F;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon-back:hover {
  background: #E5E5EA;
  transform: translateX(-2px);
}

h1 {
  margin: 0 0 8px;
  color: #111827;
}

h2 {
  margin: 0;
  color: #111827;
  font-size: 20px;
}

p {
  margin: 0;
  color: #6b7280;
}

.btn-primary,
.btn-secondary,
.btn-ghost {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 600;
}

.btn-primary {
  background: linear-gradient(135deg, #5e5ce6, #4f46e5);
  color: #fff;
}

.btn-secondary {
  background: #111827;
  color: #fff;
}

.btn-ghost {
  background: #eef2ff;
  color: #4338ca;
}

.tabs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.tab-item {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tab-item.active {
  border-color: #5e5ce6;
  color: #5e5ce6;
  background: rgba(94, 92, 230, 0.1);
}

.tab-count {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
}

.request-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.status-tag {
  border-radius: 999px;
  font-size: 12px;
  padding: 4px 10px;
  font-weight: 600;
}

.status-pending {
  background: #fffbeb;
  color: #b45309;
}

.status-matching {
  background: #eef2ff;
  color: #4338ca;
}

.status-scheduled {
  background: #ecfdf5;
  color: #047857;
}

.status-completed {
  background: #f3f4f6;
  color: #374151;
}

.status-cancelled {
  background: #fef2f2;
  color: #b91c1c;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.meta-grid span {
  color: #111827;
}

.request-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.request-status-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.request-status-item {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.request-status-item.active {
  border-color: #5e5ce6;
  color: #5e5ce6;
  background: rgba(94, 92, 230, 0.1);
}

.request-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.request-brief-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.request-brief-card:hover {
  border-color: #cbd5e1;
}

.request-brief-card.selected {
  border-color: #5e5ce6;
  box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.12);
}

.request-board-empty {
  color: #6b7280;
  font-size: 14px;
}

.candidate-box {
  margin-top: 12px;
  padding: 0;
  border: none;
  background: transparent;
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.candidate-item {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px;
  background: #ffffff;
}

.candidate-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.candidate-head strong {
  font-size: 18px;
  color: #0f172a;
}

.candidate-tag-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.candidate-status {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
}

.progress-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  color: #0f172a;
  font-size: 14px;
}

.intent-list {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px 14px;
}

.intent-list h3 {
  margin: 0 0 8px;
  color: #111827;
  font-size: 16px;
}

.intent-list p {
  margin: 0 0 10px;
  color: #6b7280;
  font-size: 13px;
}

.intent-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.intent-tag {
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  padding: 5px 10px;
  font-size: 12px;
}

.candidate-status.is-pending {
  background: #eef2ff;
  color: #4338ca;
}

.candidate-status.is-accepted {
  background: #eef2ff;
  color: #4338ca;
}

.candidate-status.is-rejected {
  background: #fef2f2;
  color: #b91c1c;
}

.candidate-hint {
  margin-top: 8px;
  font-size: 14px;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 8px 10px;
}

.candidate-hint.rejected {
  color: #b91c1c;
  background: #fef2f2;
  border-color: #fecaca;
}

.candidate-meta {
  font-size: 15px;
  color: #475569;
  margin: 0;
  line-height: 1.7;
}

.candidate-meta span {
  color: #0f172a;
  font-weight: 600;
}

.candidate-contact {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #065f46;
  font-size: 13px;
  padding: 10px;
  border-radius: 10px;
  background: #f0fdf4;
}

.candidate-actions {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.candidate-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  padding: 4px 10px;
  font-size: 12px;
}

.inline-action {
  border: none;
  background: transparent;
  color: #0ea5e9;
  margin-left: 8px;
  cursor: pointer;
}

.inline-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger-light {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 600;
  background: #fef2f2;
  color: #b91c1c;
}

.candidate-reject {
  grid-column: 1 / -1;
}

.card-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
}

.empty-card h3 {
  margin: 0 0 8px;
  color: #111827;
}

.feedback {
  margin: 0;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 12px;
  padding: 12px;
}

@media (max-width: 900px) {
  .request-status-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }

  .request-status-item {
    flex-shrink: 0;
  }

  .meta-grid {
    grid-template-columns: 1fr;
  }

  .card-actions {
    flex-wrap: wrap;
  }
}

@media (max-width: 768px) {
  .candidate-head strong {
    font-size: 18px;
  }
}

/* 表单样式 */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
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
select {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
input:focus,
select:focus {
  border-color: #5e5ce6;
  box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.12);
}
</style>
