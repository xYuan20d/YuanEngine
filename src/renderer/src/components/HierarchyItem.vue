<script setup lang="ts">
import { defineProps, defineEmits, inject } from 'vue'
import { IGameNode } from '../types/schema'

// 1. 接收 props
const props = defineProps<{
  node: IGameNode
  selectedId: string | null
  level?: number // 用来控制缩进
}>()

// 2. 定义事件
const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'contextmenu', event: MouseEvent, node: IGameNode): void
}>()

// 注入编辑器动作
const editorActions = inject<any>('editor-actions')

// 计算缩进样式
const indentStyle = {
  paddingLeft: `${(props.level || 0) * 20 + 10}px`
}

// 拖拽处理函数
const onDragStart = (e: DragEvent) => {
  if (e.dataTransfer) {
    // 记录被拖拽的节点 ID
    e.dataTransfer.setData('node-id', props.node.id)
    e.dataTransfer.effectAllowed = 'move'
  }
}

const onDrop = (e: DragEvent) => {
  if (e.dataTransfer) {
    const draggedNodeId = e.dataTransfer.getData('node-id')
    
    // 防止自己拖给自己
    if (draggedNodeId && draggedNodeId !== props.node.id) {
      editorActions.moveNode(draggedNodeId, props.node.id)
    }
  }
}

// 检查节点是否是另一个节点的祖先（防止循环引用）
const isAncestor = (parentId: string, childId: string): boolean => {
  const checkChildren = (node: IGameNode, targetId: string): boolean => {
    if (node.id === targetId) return true
    if (node.children) {
      for (const child of node.children) {
        if (checkChildren(child, targetId)) return true
      }
    }
    return false
  }
  
  // 从当前节点开始查找
  return checkChildren(props.node, childId)
}

const onDragover = (e: DragEvent) => {
  e.preventDefault()
  
  if (e.dataTransfer) {
    const draggedNodeId = e.dataTransfer.getData('node-id')
    
    // 检查是否可以拖拽到目标节点
    if (draggedNodeId && draggedNodeId !== props.node.id && !isAncestor(props.node.id, draggedNodeId)) {
      e.dataTransfer.dropEffect = 'move'
    } else {
      e.dataTransfer.dropEffect = 'none'
    }
  }
}
</script>

<template>
  <div class="hierarchy-node">
    <div 
      class="tree-item" 
      :class="{ active: selectedId === node.id }"
      :style="indentStyle"
      draggable="true"
      @dragstart.stop="onDragStart"
      @dragover.prevent="onDragover"
      @drop.stop="onDrop"
      @click.stop="emit('select', node.id)"
      @contextmenu.stop="(e) => { 
        emit('select', node.id); 
        emit('contextmenu', e, node) 
      }"
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
.tree-item[draggable="true"] { cursor: grab; }
.tree-item[draggable="true"]:active { cursor: grabbing; }
.icon { margin-right: 6px; font-size: 14px; opacity: 0.7; }
.label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>