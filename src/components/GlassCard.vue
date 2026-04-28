<script setup>
defineProps({
  maxWidth: {
    type: String,
    default: '100%'
  }
})
</script>

<template>
  <div class="glass-card-wrapper" :style="{ maxWidth }">
    <div class="glass-card">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.glass-card-wrapper {
  width: 100%;
}
</style>
