import { request, unwrapData } from './http'

export type TeacherRequestStatus = 'pending' | 'matching' | 'scheduled' | 'completed' | 'cancelled'
export type MatchStatus = 'new' | 'viewed' | 'unlocked' | 'accepted' | 'rejected' | 'expired'

export interface TeacherProfileDTO {
  teacherName: string
  phone: string
  city: string
  district?: string
  bio: string
  avatar?: string
  wechat?: string
  preferredGrades: string[]
  preferredSubjects: string[]
  experienceYears?: number
  teachingStyle?: string
  studentType?: string
  areas?: string[]
  verifyStatus?: 'pending' | 'approved' | 'rejected'
  verified?: boolean
  verifyRemark?: string
}

export interface TeacherRequestDTO {
  id: number
  title: string
  subject: string
  grade: string
  budget: string
  schedule: string
  status: TeacherRequestStatus
  parentName: string
  teacherName: string
  isMine: boolean
  createdAt: string
}

export interface TeacherReviewDTO {
  id: number
  parentName: string
  subject: string
  rating: number
  content: string
  date: string
}

export interface TeacherAnalyticsDTO {
  weeklyViews: number
  totalViews: number
  pendingRequests: number
  scheduledRequests: number
  completedRequests: number
  averageRating: number
  totalReviews: number
  responseRate: number
}

export interface TeacherMembershipStatusDTO {
  planName: string
  expireAt: string | null
  remainingUnlock: number
  weeklyPriorityQuota: number
}

export interface TeacherMembershipPlanDTO {
  id: string
  name: string
  price: number
  durationMonth: number
  features: string[]
  recommended?: boolean
}

export interface TeacherSettingsDTO {
  notifications: {
    newRequest: boolean
    messageReminder: boolean
    systemNotice: boolean
  }
  privacy: {
    showPhoneToParent: boolean
    allowParentInvite: boolean
  }
}

export interface TeacherVerificationStatusDTO {
  verifyStatus: 'pending' | 'approved' | 'rejected'
  verified: boolean
  verifyRemark: string
  certificates: Array<{
    certType: string
    certUrl: string
    status: 'pending' | 'approved' | 'rejected'
    reviewRemark: string
    createdAt: string
  }>
}

export interface TeacherMatchDTO {
  id: number
  parentId: number
  requestId: number
  title: string
  subject: string
  grade: string
  budget: string
  schedule: string
  requestStatus: string
  parentName: string
  matchScore: number
  status: MatchStatus
  matchedAt: string
  unlockedAt: string | null
}

export interface UnlockResultDTO {
  unlocked: boolean
  parentName: string
  phone: string
  wechat: string
}

export interface UnlockRecordDTO {
  id: number
  parentId: number
  parentName: string
  requestId: number
  unlockType: 'phone' | 'wechat'
  unlockCost: number
  createdAt: string
}

export interface DashboardSummaryDTO {
  newMatchCount: number
  unlockedMatchCount: number
  processingRequestCount: number
  remainingUnlock: number
}

const ENDPOINTS = {
  authSendCode: '/api/teacher/auth/send-code',
  authRegister: '/api/teacher/auth/register',
  authLogin: '/api/teacher/auth/login',
  authLogout: '/api/teacher/auth/logout',
  authMe: '/api/teacher/auth/me',
  profile: '/api/teacher/profile',
  avatar: '/api/teacher/avatar',
  requests: '/api/teacher/requests',
  reviews: '/api/teacher/reviews',
  analytics: '/api/teacher/analytics',
  membershipStatus: '/api/teacher/membership/status',
  membershipPlans: '/api/teacher/membership/plans',
  membershipSubscribe: '/api/teacher/membership/subscribe',
  settings: '/api/teacher/settings',
  settingsPassword: '/api/teacher/settings/password',
  settingsNotifications: '/api/teacher/settings/notifications',
  settingsPrivacy: '/api/teacher/settings/privacy',
  verificationUpload: '/api/teacher/verification/upload',
  verificationStatus: '/api/teacher/verification/status',
  questionnaire: '/api/teacher/questionnaire',
  questionnaireLatest: '/api/teacher/questionnaire/latest',
  matches: '/api/teacher/matches',
  unlockRecords: '/api/teacher/unlock-records',
  dashboardSummary: '/api/teacher/dashboard/summary'
}

const TEACHER_TOKEN_KEY = 'teacher_token'

const getTeacherToken = () => {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(TEACHER_TOKEN_KEY) || ''
}

const setTeacherToken = (token: string) => {
  if (typeof localStorage === 'undefined') return
  if (!token) {
    localStorage.removeItem(TEACHER_TOKEN_KEY)
    return
  }
  localStorage.setItem(TEACHER_TOKEN_KEY, token)
}

const teacherRequest = async <T = unknown>(path: string, options: any = {}) => {
  const token = getTeacherToken()
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
  return request<T>(path, { ...options, headers })
}

const ensureArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string') {
    if (!value.trim()) return []
    return value
      .split(/[,,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const parseStatus = (value: unknown): TeacherRequestStatus => {
  const status = String(value || '').toLowerCase()
  if (status === 'matching') return 'matching'
  if (status === 'scheduled') return 'scheduled'
  if (status === 'completed') return 'completed'
  if (status === 'cancelled' || status === 'canceled') return 'cancelled'
  return 'pending'
}

const normalizeProfile = (raw: Record<string, any>): TeacherProfileDTO => ({
  teacherName: String(raw.teacherName || raw.teacher_name || raw.nickname || ''),
  phone: String(raw.phone || ''),
  city: String(raw.city || ''),
  district: String(raw.district || ''),
  bio: String(raw.bio || ''),
  avatar: String(raw.avatar || ''),
  wechat: String(raw.wechat || ''),
  preferredGrades: ensureArray(raw.preferredGrades || raw.preferred_grades || raw.preferredGrade || raw.preferred_grade),
  preferredSubjects: ensureArray(raw.preferredSubjects || raw.preferred_subjects || raw.subjects),
  experienceYears: Number(raw.experienceYears || raw.experience_years || 0),
  teachingStyle: String(raw.teachingStyle || raw.teaching_style || ''),
  studentType: String(raw.studentType || raw.student_type || ''),
  areas: ensureArray(raw.areas),
  verifyStatus: String(raw.verifyStatus || raw.verify_status || 'pending') as 'pending' | 'approved' | 'rejected',
  verified: Boolean(raw.verified),
  verifyRemark: String(raw.verifyRemark || raw.verify_remark || '')
})

const normalizeRequest = (raw: Record<string, any>): TeacherRequestDTO => ({
  id: Number(raw.id || 0),
  title: String(raw.title || ''),
  subject: String(raw.subject || ''),
  grade: String(raw.grade || ''),
  budget: String(raw.budget || ''),
  schedule: String(raw.schedule || ''),
  status: parseStatus(raw.status),
  parentName: String(raw.parentName || raw.parent_name || '家长'),
  teacherName: String(raw.teacherName || raw.teacher_name || ''),
  isMine: Boolean(raw.isMine || raw.is_mine),
  createdAt: String(raw.createdAt || raw.created_at || '')
})

const normalizeReview = (raw: Record<string, any>): TeacherReviewDTO => ({
  id: Number(raw.id || 0),
  parentName: String(raw.parentName || raw.parent_name || '家长'),
  subject: String(raw.subject || ''),
  rating: Number(raw.rating || 0),
  content: String(raw.content || ''),
  date: String(raw.date || raw.created_at || '')
})

const normalizeAnalytics = (raw: Record<string, any>): TeacherAnalyticsDTO => ({
  weeklyViews: Number(raw.weeklyViews || raw.weekly_views || 0),
  totalViews: Number(raw.totalViews || raw.total_views || 0),
  pendingRequests: Number(raw.pendingRequests || raw.pending_requests || 0),
  scheduledRequests: Number(raw.scheduledRequests || raw.scheduled_requests || 0),
  completedRequests: Number(raw.completedRequests || raw.completed_requests || 0),
  averageRating: Number(raw.averageRating || raw.average_rating || 0),
  totalReviews: Number(raw.totalReviews || raw.total_reviews || 0),
  responseRate: Number(raw.responseRate || raw.response_rate || 0)
})

const normalizeMembershipStatus = (raw: Record<string, any>): TeacherMembershipStatusDTO => ({
  planName: String(raw.planName || raw.plan_name || '普通老师'),
  expireAt: raw.expireAt || raw.expire_at || null,
  remainingUnlock: Number(raw.remainingUnlock || raw.remaining_unlock || 0),
  weeklyPriorityQuota: Number(raw.weeklyPriorityQuota || raw.weekly_priority_quota || 0)
})

const normalizeMembershipPlan = (raw: Record<string, any>): TeacherMembershipPlanDTO => ({
  id: String(raw.id || ''),
  name: String(raw.name || ''),
  price: Number(raw.price || 0),
  durationMonth: Number(raw.durationMonth || raw.duration_month || 1),
  features: ensureArray(raw.features),
  recommended: Boolean(raw.recommended)
})

const normalizeSettings = (raw: Record<string, any>): TeacherSettingsDTO => ({
  notifications: {
    newRequest: Boolean(raw.notifications?.newRequest ?? raw.notifications?.new_request ?? true),
    messageReminder: Boolean(raw.notifications?.messageReminder ?? raw.notifications?.message_reminder ?? true),
    systemNotice: Boolean(raw.notifications?.systemNotice ?? raw.notifications?.system_notice ?? true)
  },
  privacy: {
    showPhoneToParent: Boolean(raw.privacy?.showPhoneToParent ?? raw.privacy?.show_phone_to_parent ?? true),
    allowParentInvite: Boolean(raw.privacy?.allowParentInvite ?? raw.privacy?.allow_parent_invite ?? true)
  }
})

export const teacherApi = {
  getToken: getTeacherToken,
  setToken: setTeacherToken,

  async sendCode(phone: string) {
    await teacherRequest(ENDPOINTS.authSendCode, { method: 'POST', body: { phone } })
  },

  async register(payload: { phone: string; password: string; code?: string; nickname?: string; city?: string }) {
    const result = unwrapData(await teacherRequest(ENDPOINTS.authRegister, { method: 'POST', body: payload }), {} as Record<string, any>)
    if (result.token) setTeacherToken(String(result.token))
    return result
  },

  async login(phone: string, password: string) {
    const result = unwrapData(await teacherRequest(ENDPOINTS.authLogin, { method: 'POST', body: { phone, password } }), {} as Record<string, any>)
    if (result.token) setTeacherToken(String(result.token))
    return result
  },

  async logout() {
    await teacherRequest(ENDPOINTS.authLogout, { method: 'POST' })
    setTeacherToken('')
  },

  async me() {
    const payload = await teacherRequest(ENDPOINTS.authMe)
    return unwrapData(payload, {} as Record<string, any>)
  },

  async getProfile() {
    const payload = await teacherRequest(ENDPOINTS.profile)
    return normalizeProfile(unwrapData(payload, {} as Record<string, any>))
  },

  async updateProfile(profile: TeacherProfileDTO) {
    await teacherRequest(ENDPOINTS.profile, { method: 'PUT', body: profile })
  },

  async uploadAvatar(base64: string) {
    await teacherRequest(ENDPOINTS.avatar, { method: 'POST', body: { avatar: base64 } })
  },

  async submitVerification(certType: 'teacher_license' | 'work_proof' | 'id_card', certUrl: string) {
    await teacherRequest(ENDPOINTS.verificationUpload, { method: 'POST', body: { certType, certUrl } })
  },

  async getVerificationStatus() {
    const payload = await teacherRequest(ENDPOINTS.verificationStatus)
    return unwrapData(payload, {
      verifyStatus: 'pending',
      verified: false,
      verifyRemark: '',
      certificates: []
    } as TeacherVerificationStatusDTO)
  },

  async saveQuestionnaire(answers: Record<string, any>) {
    await teacherRequest(ENDPOINTS.questionnaire, { method: 'POST', body: { answers } })
  },

  async getQuestionnaire() {
    const payload = await teacherRequest(ENDPOINTS.questionnaireLatest)
    return unwrapData(payload, { answers: {}, updatedAt: null as string | null })
  },

  async getMatches(status?: MatchStatus) {
    const query = status ? `?status=${status}` : ''
    const payload = await teacherRequest(`${ENDPOINTS.matches}${query}`)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? (list as TeacherMatchDTO[]) : []
  },

  async unlockMatch(id: number, unlockType: 'phone' | 'wechat' = 'phone') {
    const payload = await teacherRequest(`${ENDPOINTS.matches}/${id}/unlock`, { method: 'POST', body: { unlockType } })
    return unwrapData(payload, {} as UnlockResultDTO)
  },

  async acceptMatch(id: number) {
    await teacherRequest(`${ENDPOINTS.matches}/${id}/accept`, { method: 'POST' })
  },

  async rejectMatch(id: number) {
    await teacherRequest(`${ENDPOINTS.matches}/${id}/reject`, { method: 'POST' })
  },

  async getUnlockRecords() {
    const payload = await teacherRequest(ENDPOINTS.unlockRecords)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? (list as UnlockRecordDTO[]) : []
  },

  async getDashboardSummary() {
    const payload = await teacherRequest(ENDPOINTS.dashboardSummary)
    return unwrapData(payload, {
      newMatchCount: 0,
      unlockedMatchCount: 0,
      processingRequestCount: 0,
      remainingUnlock: 0
    } as DashboardSummaryDTO)
  },

  async getRequests() {
    const payload = await teacherRequest(ENDPOINTS.requests)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? list.map(normalizeRequest) : []
  },

  async acceptRequest(id: number) {
    await teacherRequest(`${ENDPOINTS.requests}/${id}/accept`, { method: 'POST' })
  },

  async releaseRequest(id: number) {
    await teacherRequest(`${ENDPOINTS.requests}/${id}/release`, { method: 'POST' })
  },

  async updateRequestStatus(id: number, status: TeacherRequestStatus) {
    await teacherRequest(`${ENDPOINTS.requests}/${id}/status`, { method: 'PATCH', body: { status } })
  },

  async getReviews() {
    const payload = await teacherRequest(ENDPOINTS.reviews)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? list.map(normalizeReview) : []
  },

  async getAnalytics() {
    const payload = await teacherRequest(ENDPOINTS.analytics)
    return normalizeAnalytics(unwrapData(payload, {} as Record<string, any>))
  },

  async getMembershipStatus() {
    const payload = await teacherRequest(ENDPOINTS.membershipStatus)
    return normalizeMembershipStatus(unwrapData(payload, {} as Record<string, any>))
  },

  async getMembershipPlans() {
    const payload = await teacherRequest(ENDPOINTS.membershipPlans)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? list.map(normalizeMembershipPlan) : []
  },

  async subscribeMembership(planId: string, autoRenew: boolean) {
    await teacherRequest(ENDPOINTS.membershipSubscribe, { method: 'POST', body: { plan_id: planId, auto_renew: autoRenew } })
  },

  async getSettings() {
    const payload = await teacherRequest(ENDPOINTS.settings)
    return normalizeSettings(unwrapData(payload, {} as Record<string, any>))
  },

  async updatePassword(currentPassword: string, nextPassword: string) {
    await teacherRequest(ENDPOINTS.settingsPassword, {
      method: 'PUT',
      body: { current_password: currentPassword, new_password: nextPassword }
    })
  },

  async updateNotifications(notifications: TeacherSettingsDTO['notifications']) {
    await teacherRequest(ENDPOINTS.settingsNotifications, { method: 'PUT', body: notifications })
  },

  async updatePrivacy(privacy: TeacherSettingsDTO['privacy']) {
    await teacherRequest(ENDPOINTS.settingsPrivacy, { method: 'PUT', body: privacy })
  }
}
