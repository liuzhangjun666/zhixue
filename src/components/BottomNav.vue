<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { AUTH_USER_STORAGE_KEY } from '../api/http'

const route = useRoute()

const role = computed(() => {
  if (typeof window === 'undefined') return 'parent'
  const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY) || ''
  if (!raw) return 'parent'
  try {
    const parsed = JSON.parse(raw)
    return String(parsed?.role || 'parent') === 'teacher' ? 'teacher' : 'parent'
  } catch {
    return 'parent'
  }
})

const items = computed(() => [
  { label: '首页', to: '/' },
  { label: '发现', to: role.value === 'teacher' ? '/teacher-center/match-pool' : '/discover' },
  { label: '消息', to: '/messages' },
  { label: '我的', to: role.value === 'teacher' ? '/teacher-center' : '/parent-center' }
])

const shouldShow = computed(() => !route.meta.hideNav)
</script>

<template>
  <nav v-if="shouldShow" class="bottom-nav">
    <router-link v-for="item in items" :key="item.to" :to="item.to" class="nav-item" :class="{ active: route.path === item.to || route.path.startsWith(`${item.to}/`) }">
      {{ item.label }}
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 56px;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid #e5e7eb;
  display: none;
  z-index: 120;
}
.nav-item {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  text-decoration: none;
  font-size: 13px;
}
.nav-item.active { color: #10a881; font-weight: 700; }
@media (max-width: 768px) {
  .bottom-nav { display: flex; }
}
</style>
