<script setup lang="ts">
import { useUIStore } from '../composables/useUIStore'
import DynamicVue from './DynamicVue.vue'

const { state } = useUIStore()
</script>

<template>
  <div class="ui-layer-container">
    <div 
      v-for="item in state.items" 
      :key="item.id"
      v-show="item.visible" 
      class="ui-item-wrapper"
    >
      <DynamicVue 
        :src="item.src" 
        :nodeId="item.nodeId"
      />
    </div>
  </div>
</template>

<style scoped>
.ui-layer-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 让鼠标穿透到 3D Canvas */
  overflow: hidden;
  z-index: 100;
  
  /* 样式隔离 */
  all: initial;
  display: block;
  font-family: 'Segoe UI', sans-serif;
}

/* 🟢 给个 wrapper 方便管理，但这里不需要额外样式 */
.ui-item-wrapper {
  display: contents; /* 让内部的 absolute 定位不受影响 */
}
</style>