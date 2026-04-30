<template>
  <div class="messages-container">
    <!-- 左侧栏：会话列表 -->
    <div class="conversations-sidebar">
      <div class="sidebar-header">
        <h2>消息中心</h2>
      </div>
      <div class="conversations-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: currentConversation?.id === conv.id }"
          @click="selectConversation(conv)"
        >
          <div class="avatar">
            <img v-if="conv.contactAvatar" :src="conv.contactAvatar" alt="avatar" />
            <UserIcon v-else class="icon" />
          </div>
          <div class="conv-info">
            <div class="conv-header">
              <span class="name">
                {{ conv.contactName }}
                <span class="role-badge">{{ conv.contactRole === 'teacher' ? '老师' : '家长' }}</span>
              </span>
              <span class="time">{{ formatTime(conv.updatedAt) }}</span>
            </div>
            <div class="last-message">{{ conv.lastMessage }}</div>
          </div>
        </div>
        <div v-if="conversations.length === 0" class="empty-state">暂无消息</div>
      </div>
    </div>

    <!-- 主面板：聊天区 -->
    <div class="chat-main">
      <template v-if="currentConversation">
        <div class="chat-header">
          <h3>与 {{ currentConversation.contactName }} 的对话</h3>
        </div>

        <div class="messages-list" ref="messagesListRef">
          <div
            v-for="msg in currentMessages"
            :key="msg.id"
            class="message-row"
            :class="{ mine: msg.senderId === currentUserId }"
          >
            <div class="bubble-avatar">
              <img v-if="resolveMessageAvatar(msg)" :src="resolveMessageAvatar(msg)" alt="avatar" />
              <UserIcon v-else class="icon" />
            </div>
            <div class="message-bubble">
              <div class="bubble-content">{{ msg.content }}</div>
              <div class="bubble-time">{{ formatTime(msg.createdAt) }}</div>
            </div>
            <div class="bubble-content">{{ msg.content }}</div>
            <div v-if="msg.senderId !== currentUserId" class="bubble-actions">
              <button class="report-btn" @click="reportMessage(msg)">举报</button>
            </div>
            <div class="bubble-time">{{ formatTime(msg.createdAt) }}</div>
          </div>
        </div>

        <div v-if="reportDraft.visible" class="report-panel">
          <div class="report-title">举报对象：{{ reportDraft.targetName || '对方用户' }}</div>
          <textarea
            v-model="reportDraft.content"
            class="report-textarea"
            placeholder="请输入举报原因（5-500字）"
            maxlength="500"
          />
          <div class="report-meta">{{ reportDraft.content.trim().length }}/500</div>
          <div class="report-actions">
            <button class="report-submit" :disabled="reportSubmitting" @click="submitReport">
              {{ reportSubmitting ? '提交中...' : '提交举报' }}
            </button>
            <button class="report-cancel" :disabled="reportSubmitting" @click="cancelReport">取消</button>
          </div>
        </div>

        <div class="chat-input-area">
          <input
            v-model="newMessage"
            type="text"
            placeholder="输入消息..."
            maxlength="1000"
            @keyup.enter="sendMessage"
          />
          <button class="send-btn" @click="sendMessage" :disabled="!newMessage.trim()">
            <SendIcon class="icon" />
            发送
          </button>
        </div>
        <div class="chat-input-hint">
          <span>{{ newMessage.trim().length }}/1000</span>
          <span v-if="sendError" class="error">{{ sendError }}</span>
          <span v-else-if="reportStatus" class="ok">{{ reportStatus }}</span>
        </div>
      </template>

      <div v-else class="empty-chat">
        <MessageSquareIcon class="large-icon" />
        <p>选择一个联系人开始聊天</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { User as UserIcon, Send as SendIcon, MessageSquare as MessageSquareIcon } from 'lucide-vue-next'
import { io } from 'socket.io-client'
import { API_BASE_URL, AUTH_TOKEN_STORAGE_KEY, request, unwrapData } from '../api/http'
import { clearAuthSession, getCurrentUser, getStoredUser } from '../api/auth'

const router = useRouter()
const route = useRoute()
const currentUserId = ref(Number(getStoredUser()?.id || 0))
const currentUserAvatar = ref(String(getStoredUser()?.avatar || ''))

const conversations = ref([])
const currentConversation = ref(null)
const currentMessages = ref([])
const newMessage = ref('')
const sendError = ref('')
const reportStatus = ref('')
const reportSubmitting = ref(false)
const reportDraft = ref({
  visible: false,
  messageId: 0,
  targetName: '',
  content: ''
})
const messagesListRef = ref(null)
const initialConversationId = ref(Number(route.query.conversationId || 0))
const WS_BASE_URL = API_BASE_URL ? new URL(API_BASE_URL, window.location.origin).origin : window.location.origin
const MESSAGE_MAX_LENGTH = 1000

let socket = null

const formatTime = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const resolveMessageAvatar = (msg) => {
  if (!msg) return ''
  if (Number(msg.senderId) === Number(currentUserId.value)) {
    return String(msg.senderAvatar || currentUserAvatar.value || '')
  }
  return String(msg.senderAvatar || currentConversation.value?.contactAvatar || '')
}

const scrollToBottom = async () => {
  await nextTick()
  if (messagesListRef.value) {
    messagesListRef.value.scrollTop = messagesListRef.value.scrollHeight
  }
}

const loadConversations = async () => {
  try {
    const payload = await request('/api/messages/conversations')
    conversations.value = unwrapData(payload, [])
    if (initialConversationId.value && !currentConversation.value) {
      const target = conversations.value.find((item) => Number(item.id) === initialConversationId.value)
      if (target) {
        initialConversationId.value = 0
        await selectConversation(target)
      }
    }
  } catch (err) {
    console.error('Failed to load conversations', err)
  }
}

const selectConversation = async (conv) => {
  currentConversation.value = conv
  try {
    await request(`/api/messages/${conv.id}/read`, { method: 'POST' })

    const payload = await request(`/api/messages/${conv.id}`)
    currentMessages.value = unwrapData(payload, [])
    scrollToBottom()
    loadConversations()
  } catch (err) {
    console.error('Failed to load messages', err)
  }
}

const sendMessage = () => {
  const content = newMessage.value.trim()
  if (!content || !currentConversation.value) return
  if (content.length > MESSAGE_MAX_LENGTH) {
    sendError.value = `单条消息不能超过${MESSAGE_MAX_LENGTH}字`
    return
  }
  sendError.value = ''
  reportStatus.value = ''

  const payload = {
    conversationId: currentConversation.value.id,
    receiverId: currentConversation.value.contactId,
    content
  }

  socket.emit('send_message', payload)
  newMessage.value = ''
}

const reportMessage = (msg) => {
  reportDraft.value.visible = true
  reportDraft.value.messageId = Number(msg.id || 0)
  reportDraft.value.targetName = String(currentConversation.value?.contactName || '').trim()
  reportDraft.value.content = ''
  reportStatus.value = ''
  sendError.value = ''
}

const cancelReport = () => {
  reportDraft.value.visible = false
  reportDraft.value.messageId = 0
  reportDraft.value.targetName = ''
  reportDraft.value.content = ''
}

const submitReport = async () => {
  const content = reportDraft.value.content.trim()
  const messageId = Number(reportDraft.value.messageId || 0)
  if (!messageId) {
    reportStatus.value = '举报目标无效'
    return
  }
  if (content.length < 5 || content.length > 500) {
    reportStatus.value = '举报原因需在 5-500 字'
    return
  }
  reportSubmitting.value = true
  try {
    await request(`/api/reports/messages/${messageId}`, {
      method: 'POST',
      body: {
        type: 'harassment',
        content
      }
    })
    reportStatus.value = '举报已提交'
    sendError.value = ''
    cancelReport()
  } catch (error) {
    reportStatus.value = ''
    sendError.value = (error && error.message) || '举报提交失败'
  } finally {
    reportSubmitting.value = false
  }
}

onMounted(() => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '' : ''
  if (!token) {
    router.replace('/login')
    return
  }

  getCurrentUser()
    .then((user) => {
      currentUserId.value = Number(user.id || 0)
      currentUserAvatar.value = String(user.avatar || '')
    })
    .catch(() => {
      clearAuthSession()
      router.replace({ path: '/login', query: { redirect: route.fullPath } })
    })
    .finally(() => {
      loadConversations()
    })

  socket = io(WS_BASE_URL, {
    auth: {
      token
    }
  })

  socket.on('receive_message', (msg) => {
    // 如果收到的消息属于当前打开的会话，则直接追加显示
    if (currentConversation.value && msg.conversationId === currentConversation.value.id) {
      currentMessages.value.push(msg)
      scrollToBottom()
    }
    // 刷新会话列表，更新最后一条消息和未读数
    loadConversations()
  })

  socket.on('message_sent', (msg) => {
    sendError.value = ''
    reportStatus.value = ''
    if (currentConversation.value && msg.conversationId === currentConversation.value.id) {
      currentMessages.value.push(msg)
      scrollToBottom()
    }
    loadConversations()
  })

  socket.on('message_error', (payload) => {
    sendError.value = String(payload?.message || '消息发送失败，请稍后重试')
    reportStatus.value = ''
  })

  socket.on('connect_error', (error) => {
    const message = String(error?.message || '')
    if (message.toLowerCase().includes('unauthorized')) {
      clearAuthSession()
      router.replace({ path: '/login', query: { redirect: route.fullPath } })
      return
    }
    console.warn('Socket connect error:', message || error)
  })
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
  }
})
</script>

<style scoped>
.messages-container {
  display: flex;
  height: calc(100vh - 100px); /* 减去 navbar 的高度和外边距 */
  max-width: 1200px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.5);
  margin-top: 20px;
  margin-bottom: 20px;
}

.conversations-sidebar {
  width: 320px;
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.3);
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #1d1d1f;
}

.conversations-list {
  flex: 1;
  overflow-y: auto;
}

.conversation-item {
  display: flex;
  padding: 16px 20px;
  cursor: pointer;
  transition: background-color 0.2s;
  align-items: center;
  gap: 12px;
}

.conversation-item:hover {
  background: rgba(0, 113, 227, 0.05);
}

.conversation-item.active {
  background: rgba(0, 113, 227, 0.1);
  border-left: 4px solid #0071e3;
  padding-left: 16px; /* 补偿左侧边框宽度 */
}

.avatar {
  width: 48px;
  height: 48px;
  background: #f5f5f7;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #86868b;
}

.avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.conv-info {
  flex: 1;
  min-width: 0;
}

.conv-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.name {
  font-weight: 600;
  color: #1d1d1f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role-badge {
  margin-left: 6px;
  font-size: 11px;
  color: #0071e3;
  background: rgba(0, 113, 227, 0.1);
  border-radius: 999px;
  padding: 2px 6px;
}

.time {
  font-size: 12px;
  color: #86868b;
  flex-shrink: 0;
}

.last-message {
  font-size: 14px;
  color: #6e6e73;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: #86868b;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header {
  padding: 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.chat-header h3 {
  margin: 0;
  color: #1d1d1f;
  font-size: 1.1rem;
}

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.message-row.mine {
  flex-direction: row-reverse;
}

.bubble-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #f5f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #86868b;
  flex-shrink: 0;
}

.bubble-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.bubble-avatar .icon {
  width: 16px;
  height: 16px;
}

.message-bubble {
  max-width: 70%;
}

.bubble-content {
  padding: 10px 14px;
  border-radius: 14px;
  background: #f2f2f7;
  color: #1d1d1f;
  line-height: 1.5;
  word-break: break-word;
}

.message-row.mine .bubble-content {
  background: #0071e3;
  color: #fff;
}

.bubble-time {
  margin-top: 4px;
  font-size: 11px;
  color: #86868b;
}

.bubble-actions {
  margin-top: 4px;
}

.report-btn {
  border: none;
  background: transparent;
  color: #dc2626;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.chat-input-area {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.chat-input-area input {
  flex: 1;
  border: 1px solid #d2d2d7;
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 14px;
  outline: none;
}

.chat-input-area input:focus {
  border-color: #0071e3;
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
}

.report-panel {
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  padding: 12px 20px;
  background: rgba(220, 38, 38, 0.03);
}

.report-title {
  font-size: 13px;
  color: #991b1b;
  font-weight: 600;
  margin-bottom: 8px;
}

.report-textarea {
  width: 100%;
  min-height: 72px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  resize: vertical;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
}

.report-textarea:focus {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
}

.report-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
}

.report-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.report-submit,
.report-cancel {
  border: none;
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
}

.report-submit {
  background: #dc2626;
  color: #fff;
}

.report-cancel {
  background: #e5e7eb;
  color: #374151;
}

.chat-input-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 0 20px 12px;
  color: #94a3b8;
  font-size: 12px;
  min-height: 20px;
}

.chat-input-hint .error {
  color: #dc2626;
}

.chat-input-hint .ok {
  color: #16a34a;
}

.send-btn {
  border: none;
  border-radius: 999px;
  background: #0071e3;
  color: #fff;
  padding: 0 16px;
  min-width: 88px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn .icon {
  width: 14px;
  height: 14px;
}

.empty-chat {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #86868b;
  gap: 10px;
}

.large-icon {
  width: 32px;
  height: 32px;
}

@media (max-width: 900px) {
  .messages-container {
    height: calc(100vh - 72px);
    border-radius: 0;
    margin-top: 0;
    margin-bottom: 0;
  }

  .conversations-sidebar {
    width: 44%;
  }

  .chat-main {
    width: 56%;
  }
}

@media (max-width: 720px) {
  .messages-container {
    flex-direction: column;
    height: auto;
    min-height: calc(100vh - 72px);
  }

  .conversations-sidebar,
  .chat-main {
    width: 100%;
  }

  .conversations-sidebar {
    max-height: 40vh;
  }

  .message-bubble {
    max-width: 88%;
  }
}
</style>
