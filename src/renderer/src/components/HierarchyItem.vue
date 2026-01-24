<script setup lang="ts">
import { defineProps, defineEmits } from 'vue'
import { IGameNode } from '../types/schema'

// 1. 接收 props
const props = defineProps<{
  node: IGameNode
  selectedId: string | null
  level?: number // 用来控制缩进
}>()

// 2. 定义事件
// 注意：递归组件的事件需要一层层往上冒泡，或者直接调用注入的全局方法
// 这里为了简单，我们继续用 emit，并在模板里透传
const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'contextmenu', event: MouseEvent, node: IGameNode): void
}>()

// 计算缩进样式
const indentStyle = {
  paddingLeft: `${(props.level || 0) * 20 + 10}px`
}
</script>

<template>
  <div class="hierarchy-node">
    <div 
      class="tree-item" 
      :class="{ active: selectedId === node.id }"
      :style="indentStyle"
      @click.stop="emit('select', node.id)"
      @contextmenu.stop="(e) => emit('contextmenu', e, node)"
    >
      <span class="icon">{{ node.children && node.children.length > 0 ? '📂' : '📦' }}</span> 
      <span class="label">{{ node.name }}</span>
    </div>

    <div v-if="node.children && node.children.length > 0">
      <HierarchyItem 
        v-for="child in node.children" 
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :level="(level || 0) + 1"
        @select="(id) => emit('select', id)"
        @contextmenu="(e, n) => emit('contextmenu', e, n)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-item {
  padding: 6px 10px; 
  cursor: pointer; 
  font-size: 13px;
  color: #333; 
  display: flex; 
  align-items: center; 
  margin-bottom: 1px;
  user-select: none;
  transition: background 0.1s;
}
.tree-item:hover { background-color: #f0f2f5; }
.tree-item.active { background-color: #e6f7ff; color: #1890ff; font-weight: 500; }
.icon { margin-right: 6px; font-size: 14px; opacity: 0.7; }
.label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>