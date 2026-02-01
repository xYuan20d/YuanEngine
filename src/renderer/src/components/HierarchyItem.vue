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

// 🟢 核心修复 1: 宽松的 DragOver
// 不要在这里检查 ID 或祖先关系，因为 dataTransfer 在此阶段不可读
// 只要有东西拖进来，先允许 drop，否则浏览器会回弹
const onDragOver = (e: DragEvent) => {
  e.preventDefault() 
  if (e.dataTransfer) {
    const isAsset = e.dataTransfer.types.includes('asset/path')
    if (isAsset) {
      e.dataTransfer.dropEffect = 'copy' // 宏文件 -> 复制
    } else {
      e.dataTransfer.dropEffect = 'move' // 内部节点 -> 移动
    }
  }
}

// 🟢 核心修复 2: 完整的 Drop 逻辑
const onDrop = (e: DragEvent) => {
  e.stopPropagation() // 🚨 关键：阻止冒泡！否则会同时触发根目录的 Drop，导致被丢到最外层
  if (!e.dataTransfer) return

  const draggedNodeId = e.dataTransfer.getData('node-id')
  const assetPath = e.dataTransfer.getData('asset/path')

  // 情况 A: 内部节点移动 (成为当前节点的子节点)
  if (draggedNodeId) {
    if (draggedNodeId !== props.node.id) {
      editorActions.moveNode(draggedNodeId, props.node.id)
    }
  }
  // 情况 B: 宏文件实例化 (成为当前节点的子节点)
  else if (assetPath && assetPath.endsWith('.macro')) {
    editorActions.instantiateMacro(assetPath, props.node.id)
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
      @dragover.prevent="onDragOver"
      @drop.stop="onDrop"
      @click.stop="emit('select', node.id)"
      @contextmenu.stop="(e) => { 
        emit('select', node.id); 
        emit('contextmenu', e, node) 
      }"
    >
      <span class="icon">
        {{ node.macro ? '📦' : (node.children && node.children.length > 0 ? '📂' : '🧊') }}
      </span> 
      
      <span 
        class="label" 
        :class="{ 'is-macro': !!node.macro }"
      >
        {{ node.name }}
      </span>
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

.icon { margin-right: 6px; font-size: 14px; opacity: 0.8; }
.label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 宏样式 */
.is-macro {
  color: #8e44ad; 
  font-weight: 600;
}

/* 选中时宏样式修正 */
.tree-item.active .is-macro {
  color: #fff;
}
</style>