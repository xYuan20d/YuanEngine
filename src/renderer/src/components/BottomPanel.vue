<script setup lang="ts">
import { ref } from 'vue'
import AssetBrowser from './AssetBrowser.vue'
import ConsolePanel from './ConsolePanel.vue'
import AnimationPanel from './AnimationPanel.vue' // 🟢 1. 引入组件

// 定义页签类型
// 🟢 2. 添加 'animation' 类型
type TabType = 'assets' | 'console' | 'animation' | 'terminal'

const activeTab = ref<TabType>('assets')

const tabs = [
  { id: 'assets', label: 'Project' },
  { id: 'console', label: 'Console' },
  { id: 'animation', label: 'Animation' }, // 🟢 3. 添加选项卡
  { id: 'terminal', label: 'Terminal', disabled: true }
]
</script>

<template>
  <div class="bottom-panel-container">
    <div class="tab-header">
      <div 
        v-for="tab in tabs" 
        :key="tab.id"
        class="tab-item"
        :class="{ active: activeTab === tab.id, disabled: tab.disabled }"
        @click="!tab.disabled && (activeTab = tab.id as TabType)"
      >
        {{ tab.label }}
      </div>
    </div>

    <div class="tab-content">
      
      <div class="panel-view" v-show="activeTab === 'assets'">
        <AssetBrowser />
      </div>

      <div class="panel-view" v-show="activeTab === 'console'">
        <ConsolePanel />
      </div>
      
      <div class="panel-view" v-show="activeTab === 'animation'">
        <AnimationPanel />
      </div>

    </div>
  </div>
</template>

<style scoped>
.bottom-panel-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  overflow: hidden;
}

.tab-header {
  display: flex;
  height: 28px;
  background: #f3f3f3; /* VS Code 风格的深色或者浅色背景 */
  border-bottom: 1px solid #e0e0e0;
  user-select: none;
}

.tab-item {
  padding: 0 16px;
  display: flex;
  align-items: center;
  font-size: 11px;
  text-transform: uppercase;
  color: #666;
  cursor: pointer;
  border-right: 1px solid transparent;
  position: relative;
  transition: all 0.2s;
}

.tab-item:hover:not(.disabled) {
  color: #333;
  background: #ececec;
}

.tab-item.active {
  color: #333;
  font-weight: 600;
  background: #fff;
  border-top: 2px solid #42b883; /* 激活的高亮条 */
}

.tab-item.disabled {
  color: #aaa;
  cursor: not-allowed;
}

.tab-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.panel-view {
  width: 100%;
  height: 100%;
}
</style>