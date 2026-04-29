import { request, unwrapData } from './http'

export type RequestStatus = 'pending' | 'matching' | 'scheduled' | 'completed' | 'cancelled'

export interface ChildProfileDTO {
  id: number
  name: string
  grade: string
  targetSubject: string
}

export interface ParentProfileDTO {
  parentName: string
  phone: string
  city: string
  bio: string
  avatar?: string
  preferredGrade: string
  preferredSubjects: string[]
  children: ChildProfileDTO[]
}

export interface ParentRequestDTO {
  id: number
  title: string
  subject: string
  grade: string
  budget: string
  schedule: string
  createdAt: string
  status: RequestStatus
  teacherName?: string
  description?: string
}

export interface ReviewDTO {
  id: number
  teacherName: string
  subject: string
  rating: number
  content: string
  date: string
  reply?: string
}

export interface MembershipStatusDTO {
  planName: string
  expireAt: string
  remainingUnlock: number
  weeklyPriorityQuota: number
}

export interface MembershipPlanDTO {
  id: string
  name: string
  price: number
  durationMonth: number
  features: string[]
  recommended?: boolean
}

export interface ParentSettingsDTO {
  notifications: {
    systemNotice: boolean
    requestUpdate: boolean
    classReminder: boolean
    smsAlert: boolean
  }
  privacy: {
    showPhoneToMatchedTeacher: boolean
    allowTeacherInvite: boolean
    shareLearningReport: boolean
  }
}

const ENDPOINTS = {
  profile: '/api/parent/profile',
  requests: '/api/parent/requests',
  reviews: '/api/parent/reviews',
  membershipStatus: '/api/membership/status',
  membershipPlans: '/api/membership/plans?role=parent',
  membershipSubscribe: '/api/membership/subscribe',
  settings: '/api/parent/settings',
  settingsPassword: '/api/parent/settings/password',
  settingsNotifications: '/api/parent/settings/notifications',
  settingsPrivacy: '/api/parent/settings/privacy',
  settingsDeactivate: '/api/parent/settings/deactivate'
}

const parseStatus = (value: unknown): RequestStatus => {
  const status = String(value ?? '').toLowerCase()
  if (['pending', '待处理'].includes(status)) return 'pending'
  if (['matching', '匹配中'].includes(status)) return 'matching'
  if (['scheduled', '已约课'].includes(status)) return 'scheduled'
  if (['completed', '已完成'].includes(status)) return 'completed'
  if (['cancelled', 'canceled', '已取消'].includes(status)) return 'cancelled'
  return 'pending'
}

const normalizeProfile = (raw: Record<string, any>): ParentProfileDTO => {
  const childrenSource = raw.children || raw.students || []
  return {
    parentName: raw.parentName || raw.parent_name || raw.nickname || '',
    phone: raw.phone || raw.mobile || '',
    city: raw.city || raw.city_name || '',
    bio: raw.bio || raw.intro || '',
    avatar: raw.avatar || '',
    preferredGrade: raw.preferredGrade || raw.preferred_grade || '',
    preferredSubjects: raw.preferredSubjects || raw.preferred_subjects || [],
    children: Array.isArray(childrenSource)
      ? childrenSource.map((item: Record<string, any>) => ({
          id: Number(item.id || Date.now()),
          name: String(item.name || item.student_name || ''),
          grade: String(item.grade || item.student_grade || ''),
          targetSubject: String(item.targetSubject || item.target_subject || item.subject || '')
        }))
      : []
  }
}

const normalizeRequest = (raw: Record<string, any>): ParentRequestDTO => ({
  id: Number(raw.id || 0),
  title: String(raw.title || raw.request_title || raw.subject || '未命名请求'),
  subject: String(raw.subject || raw.target_subject || ''),
  grade: String(raw.grade || raw.target_grade || ''),
  budget: String(raw.budget || raw.price_range || ''),
  schedule: String(raw.schedule || raw.preferred_time || ''),
  createdAt: String(raw.createdAt || raw.created_at || ''),
  status: parseStatus(raw.status),
  teacherName: raw.teacherName || raw.teacher_name || raw.teacher?.name || '',
  description: String(raw.description || raw.detail || '')
})

const normalizeReview = (raw: Record<string, any>): ReviewDTO => ({
  id: Number(raw.id || 0),
  teacherName: String(raw.teacherName || raw.teacher_name || raw.teacher?.name || '未知老师'),
  subject: String(raw.subject || raw.course_subject || ''),
  rating: Number(raw.rating || raw.average_rating || 0),
  content: String(raw.content || raw.comment || ''),
  date: String(raw.date || raw.created_at || ''),
  reply: raw.reply || raw.parent_reply || ''
})

const normalizeMembershipStatus = (raw: Record<string, any>): MembershipStatusDTO => ({
  planName: String(raw.planName || raw.plan_name || '普通用户'),
  expireAt: String(raw.expireAt || raw.expire_at || '-'),
  remainingUnlock: Number(raw.remainingUnlock || raw.remaining_unlock || raw.remaining_matches || 0),
  weeklyPriorityQuota: Number(raw.weeklyPriorityQuota || raw.weekly_priority_quota || raw.priority_quota || 0)
})

const normalizeMembershipPlan = (raw: Record<string, any>): MembershipPlanDTO => ({
  id: String(raw.id),
  name: String(raw.name || '未命名套餐'),
  price: Number(raw.price || 0),
  durationMonth: Number(raw.durationMonth || raw.duration_month || 1),
  features: Array.isArray(raw.features || raw.feature_list) ? (raw.features || raw.feature_list) : [],
  recommended: Boolean(raw.recommended || raw.is_recommended)
})

const normalizeSettings = (raw: Record<string, any>): ParentSettingsDTO => ({
  notifications: {
    systemNotice: Boolean(raw.notifications?.systemNotice ?? raw.notifications?.system_notice ?? true),
    requestUpdate: Boolean(raw.notifications?.requestUpdate ?? raw.notifications?.request_update ?? true),
    classReminder: Boolean(raw.notifications?.classReminder ?? raw.notifications?.class_reminder ?? true),
    smsAlert: Boolean(raw.notifications?.smsAlert ?? raw.notifications?.sms_alert ?? false)
  },
  privacy: {
    showPhoneToMatchedTeacher: Boolean(
      raw.privacy?.showPhoneToMatchedTeacher ?? raw.privacy?.show_phone_to_matched_teacher ?? true
    ),
    allowTeacherInvite: Boolean(raw.privacy?.allowTeacherInvite ?? raw.privacy?.allow_teacher_invite ?? true),
    shareLearningReport: Boolean(raw.privacy?.shareLearningReport ?? raw.privacy?.share_learning_report ?? false)
  }
})

export const parentApi = {
  endpoints: ENDPOINTS,

  async getProfile() {
    const payload = await request(ENDPOINTS.profile)
    return normalizeProfile(unwrapData(payload, {} as Record<string, any>))
  },

  async updateProfile(profile: ParentProfileDTO) {
    await request(ENDPOINTS.profile, { method: 'PUT', body: profile })
  },

  async uploadAvatar(base64: string) {
    const payload = await request('/api/parent/avatar', { method: 'POST', body: { avatar: base64 } })
    return unwrapData(payload, {} as Record<string, any>)
  },

  async getRequests() {
    const payload = await request(ENDPOINTS.requests)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? list.map(normalizeRequest) : []
  },

  async getRequestDetail(id: number) {
    const payload = await request(`${ENDPOINTS.requests}/${id}`)
    return normalizeRequest(unwrapData(payload, {} as Record<string, any>))
  },

  async createRequest(payload: Partial<ParentRequestDTO>) {
    const res = await request(ENDPOINTS.requests, { method: 'POST', body: payload })
    return unwrapData(res, {} as Record<string, any>)
  },

  async updateRequestStatus(id: number, status: RequestStatus) {
    await request(`${ENDPOINTS.requests}/${id}/status`, { method: 'PATCH', body: { status } })
  },

  async getReviews() {
    const payload = await request(ENDPOINTS.reviews)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? list.map(normalizeReview) : []
  },

  async replyReview(id: number, reply: string) {
    await request(`${ENDPOINTS.reviews}/${id}/reply`, { method: 'POST', body: { reply } })
  },

  async getMembershipStatus() {
    const payload = await request(ENDPOINTS.membershipStatus)
    return normalizeMembershipStatus(unwrapData(payload, {} as Record<string, any>))
  },

  async getMembershipPlans() {
    const payload = await request(ENDPOINTS.membershipPlans)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? list.map(normalizeMembershipPlan) : []
  },

  async subscribeMembership(planId: string, autoRenew: boolean) {
    await request(ENDPOINTS.membershipSubscribe, { method: 'POST', body: { plan_id: planId, auto_renew: autoRenew } })
  },

  async getSettings() {
    const payload = await request(ENDPOINTS.settings)
    return normalizeSettings(unwrapData(payload, {} as Record<string, any>))
  },

  async updatePassword(currentPassword: string, nextPassword: string) {
    await request(ENDPOINTS.settingsPassword, {
      method: 'PUT',
      body: { current_password: currentPassword, new_password: nextPassword }
    })
  },

  async updateNotifications(notifications: ParentSettingsDTO['notifications']) {
    await request(ENDPOINTS.settingsNotifications, { method: 'PUT', body: notifications })
  },

  async updatePrivacy(privacy: ParentSettingsDTO['privacy']) {
    await request(ENDPOINTS.settingsPrivacy, { method: 'PUT', body: privacy })
  },

  async deactivateAccount(confirmText: string) {
    await request(ENDPOINTS.settingsDeactivate, { method: 'POST', body: { confirm_text: confirmText } })
  }
}
