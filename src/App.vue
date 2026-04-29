<script setup lang="ts">
import { useRoute } from 'vue-router'
import NavBar from './components/NavBar.vue'
import BottomNav from './components/BottomNav.vue'

const route = useRoute()
</script>

<template>
  <NavBar v-if="!route.meta.hideNav" />
  <main class="app-main" :class="{ 'no-padding': route.meta.hideNav }">
    <router-view></router-view>
  </main>
  <BottomNav />
  
  <!-- 底部版权区 -->
  <footer class="app-footer" v-if="!route.meta.hideFooter">
    <div class="footer-content">
      <span>© 2025 知学空间</span>
      <span class="divider">|</span>
      <a href="#" class="footer-link">ICP备案号</a>
      <span class="divider">|</span>
      <a href="#" class="footer-link">隐私政策</a>
    </div>
  </footer>
</template>

<style scoped>
.app-main {
  min-height: calc(100vh - 60px - 60px); /* 减去导航和底部高度 */
  padding: var(--page-padding);
  max-width: var(--max-width);
  margin: 0 auto;
}

.app-main.no-padding {
  padding: 0;
  max-width: 100%;
  min-height: 100vh;
}

.app-footer {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-light);
  font-size: 12px;
}

.footer-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.divider {
  color: var(--color-border);
}

.footer-link:hover {
  color: var(--color-primary);
}

@media (max-width: 768px) {
  .app-main {
    padding: 24px 16px;
    padding-bottom: 76px;
  }
}
</style>
