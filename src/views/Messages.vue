<template>
  <div class="messages-container">
    <!-- 侧边栏：会话列表 -->
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
            <UserIcon class="icon" />
          </div>
          <div class="conv-info">
            <div class="conv-header">
              <span class="name">{{ conv.contactName }} <span class="role-badge">{{ conv.contactRole === 'teacher' ? '教师' : '家长' }}</span></span>
              <span class="time">{{ formatTime(conv.updatedAt) }}</span>
            </div>
            <div class="last-message">{{ conv.lastMessage }}</div>
          </div>
        </div>
        <div v-if="conversations.length === 0" class="empty-state">
          暂无消息
        </div>
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
            class="message-bubble"
            :class="{ 'mine': msg.senderId === currentUserId }"
          >
            <div class="bubble-content">{{ msg.content }}</div>
            <div class="bubble-time">{{ formatTime(msg.createdAt) }}</div>
          </div>
        </div>

        <div class="chat-input-area">
          <input 
            v-model="newMessage" 
            type="text" 
            placeholder="输入消息..." 
            @keyup.enter="sendMessage"
          />
          <button class="send-btn" @click="sendMessage" :disabled="!newMessage.trim()">
            <SendIcon class="icon" />
            发送
          </button>
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
import { useRouter } from 'vue-router'
import { User as UserIcon, Send as SendIcon, MessageSquare as MessageSquareIcon } from 'lucide-vue-next'
import { io } from 'socket.io-client'
import { API_BASE_URL, AUTH_TOKEN_STORAGE_KEY, request, unwrapData } from '../api/http'
import { getCurrentUser, getStoredUser } from '../api/auth'

const router = useRouter()
const currentUserId = ref(Number(getStoredUser()?.id || 0))

const conversations = ref([])
const currentConversation = ref(null)
const currentMessages = ref([])
const newMessage = ref('')
const messagesListRef = ref(null)
const WS_BASE_URL = API_BASE_URL ? new URL(API_BASE_URL, window.location.origin).origin : window.location.origin

let socket = null

const formatTime = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  if (!newMessage.value.trim() || !currentConversation.value) return

  const payload = {
    conversationId: currentConversation.value.id,
    receiverId: currentConversation.value.contactId,
    content: newMessage.value.trim()
  }

  socket.emit('send_message', payload)
  newMessage.value = ''
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
    })
    .catch(() => {
      router.replace('/login')
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
    // 如果收到的消息属于当前打开的会话
    if (currentConversation.value && msg.conversationId === currentConversation.value.id) {
      currentMessages.value.push(msg)
      scrollToBottom()
    }
    // 重新加载会话列表，刷新最新消息
    loadConversations()
  })

  socket.on('message_sent', (msg) => {
    if (currentConversation.value && msg.conversationId === currentConversation.value.id) {
      currentMessages.value.push(msg)
      scrollToBottom()
    }
    loadConversations()
  })

  socket.on('connect_error', () => {
    router.replace('/login')
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
  height: calc(100vh - 100px); /* 鍑忓幓 navbar 鐨勯珮搴﹀強闂磋窛 */
  max-width: 1200px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.05);
  border: 1px solid rgba(255, 255, 255, 0.5);
  margin-top: 20px;
  margin-bottom: 20px;
}

.conversations-sidebar {
  width: 320px;
  border-right: 1px solid rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.3);
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
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
  padding-left: 16px; /* 琛ュ伩 border 瀹藉害 */
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
  font-size: 1rem;
}

.role-badge {
  font-size: 0.7rem;
  background: #e8f0fe;
  color: #0071e3;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 4px;
}

.time {
  font-size: 0.8rem;
  color: #86868b;
}

.last-message {
  font-size: 0.9rem;
  color: #86868b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.chat-header {
  padding: 20px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}

.chat-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #1d1d1f;
}

.messages-list {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-bubble {
  max-width: 70%;
  align-self: flex-start;
}

.message-bubble.mine {
  align-self: flex-end;
}

.bubble-content {
  background: #f5f5f7;
  color: #1d1d1f;
  padding: 12px 16px;
  border-radius: 18px;
  border-bottom-left-radius: 4px;
  font-size: 0.95rem;
  line-height: 1.4;
  word-break: break-word;
}

.message-bubble.mine .bubble-content {
  background: #0071e3;
  color: #fff;
  border-bottom-left-radius: 18px;
  border-bottom-right-radius: 4px;
}

.bubble-time {
  font-size: 0.75rem;
  color: #86868b;
  margin-top: 4px;
  margin-left: 8px;
}

.message-bubble.mine .bubble-time {
  text-align: right;
  margin-right: 8px;
}

.chat-input-area {
  padding: 20px;
  border-top: 1px solid rgba(0,0,0,0.05);
  display: flex;
  gap: 12px;
  background: #fff;
}

.chat-input-area input {
  flex: 1;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid #d2d2d7;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.chat-input-area input:focus {
  border-color: #0071e3;
}

.send-btn {
  background: #0071e3;
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 0 20px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: #0077ed;
}

.send-btn:disabled {
  background: #a1c6ea;
  cursor: not-allowed;
}

.send-btn .icon {
  width: 18px;
  height: 18px;
}

.empty-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #86868b;
}

.large-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #86868b;
}
</style>

