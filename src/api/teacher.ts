import { request, unwrapData } from './http'

export type TeacherRequestStatus = 'pending' | 'matching' | 'scheduled' | 'completed' | 'cancelled'

export interface TeacherProfileDTO {
  teacherName: string
  phone: string
  city: string
  bio: string
  avatar?: string
  preferredGrades: string[]
  preferredSubjects: string[]
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

const ENDPOINTS = {
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
  settingsPrivacy: '/api/teacher/settings/privacy'
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
  bio: String(raw.bio || ''),
  avatar: String(raw.avatar || ''),
  preferredGrades: ensureArray(raw.preferredGrades || raw.preferred_grades || raw.preferredGrade || raw.preferred_grade),
  preferredSubjects: ensureArray(raw.preferredSubjects || raw.preferred_subjects || raw.subjects)
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
  async getProfile() {
    const payload = await request(ENDPOINTS.profile)
    return normalizeProfile(unwrapData(payload, {} as Record<string, any>))
  },

  async updateProfile(profile: TeacherProfileDTO) {
    await request(ENDPOINTS.profile, { method: 'PUT', body: profile })
  },

  async uploadAvatar(base64: string) {
    await request(ENDPOINTS.avatar, { method: 'POST', body: { avatar: base64 } })
  },

  async getRequests() {
    const payload = await request(ENDPOINTS.requests)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? list.map(normalizeRequest) : []
  },

  async acceptRequest(id: number) {
    await request(`${ENDPOINTS.requests}/${id}/accept`, { method: 'POST' })
  },

  async releaseRequest(id: number) {
    await request(`${ENDPOINTS.requests}/${id}/release`, { method: 'POST' })
  },

  async updateRequestStatus(id: number, status: TeacherRequestStatus) {
    await request(`${ENDPOINTS.requests}/${id}/status`, { method: 'PATCH', body: { status } })
  },

  async getReviews() {
    const payload = await request(ENDPOINTS.reviews)
    const list = unwrapData(payload, [] as Record<string, any>[])
    return Array.isArray(list) ? list.map(normalizeReview) : []
  },

  async getAnalytics() {
    const payload = await request(ENDPOINTS.analytics)
    return normalizeAnalytics(unwrapData(payload, {} as Record<string, any>))
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

  async updateNotifications(notifications: TeacherSettingsDTO['notifications']) {
    await request(ENDPOINTS.settingsNotifications, { method: 'PUT', body: notifications })
  },

  async updatePrivacy(privacy: TeacherSettingsDTO['privacy']) {
    await request(ENDPOINTS.settingsPrivacy, { method: 'PUT', body: privacy })
  }
}
