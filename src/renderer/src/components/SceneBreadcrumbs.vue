<script setup lang="ts">
import { SceneManager } from '../engine/SceneManager'

// 🟢 接收父组件传来的状态，用来改变图标样式
defineProps<{
  toolsVisible: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-tools'): void
}>()

const { stack, jumpToContext } = SceneManager
</script>

<template>
  <div class="breadcrumbs-bar">
    <div class="path-container">
      <div 
        v-for="(ctx, index) in stack" 
        :key="ctx.id"
        class="crumb-item"
        :class="{ active: index === stack.length - 1 }"
        @click="jumpToContext(index)"
      >
        <span class="icon">{{ ctx.type === 'root' ? '🏠' : '📦' }}</span>
        <span class="name">{{ ctx.name }}</span>
        <span v-if="ctx.isDirty" class="dirty-mark">*</span>
        <span v-if="index < stack.length - 1" class="separator">/</span>
      </div>
    </div>

    <button 
      class="tool-toggle-btn" 
      :class="{ active: toolsVisible }"
      @click="emit('toggle-tools')"
      title="Toggle Toolbar"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.breadcrumbs-bar {
  height: 30px;
  background: #e1e4e8;
  display: flex;
  align-items: center;
  justify-content: space-between; /* 🟢 关键：两端对齐 */
  padding: 0 10px;
  font-size: 12px;
  border-bottom: 1px solid #ccc;
  user-select: none;
}

.path-container {
  display: flex;
  align-items: center;
  overflow: hidden; /* 防止路径太长把按钮挤出去 */
}

.crumb-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: #555;
  transition: color 0.2s;
  white-space: nowrap;
}

.crumb-item:hover { color: #000; font-weight: 500; }
.crumb-item.active { color: #000; font-weight: 700; cursor: default; }

.icon { margin-right: 4px; }
.dirty-mark { margin-left: 2px; color: #ff9800; }
.separator { margin: 0 8px; color: #999; font-weight: normal; }

/* 🟢 开关按钮样式 */
.tool-toggle-btn {
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  color: #666;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.tool-toggle-btn:hover {
  background: rgba(0,0,0,0.05);
  color: #333;
}

.tool-toggle-btn.active {
  background: #fff;
  color: #42b883; /* 激活时变绿 */
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}
</style>