<script setup lang="ts">
import { defineProps, defineEmits, inject, ref, computed } from 'vue'
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

// 🟢 新增：折叠状态控制
// 默认展开 (true)，也可以根据层级 level > X 来默认折叠
const isOpen = ref(true)

const hasChildren = computed(() => props.node.children && props.node.children.length > 0)

const toggleFold = () => {
  isOpen.value = !isOpen.value
}

// 计算缩进样式
// 🟢 修改：稍微调整基础缩进，给折叠箭头留出空间
const indentStyle = computed(() => ({
  paddingLeft: `${(props.level || 0) * 16 + 4}px`
}))

// --- 拖拽处理函数 (保持不变) ---
const onDragStart = (e: DragEvent) => {
  if (e.dataTransfer) {
    // 记录被拖拽的节点 ID
    e.dataTransfer.setData('node-id', props.node.id)
    e.dataTransfer.effectAllowed = 'move'
  }
}

const onDragOver = (e: DragEvent) => {
  e.preventDefault() 
  if (e.dataTransfer) {
    const isAsset = e.dataTransfer.types.includes('asset/path')
    if (isAsset) {
      e.dataTransfer.dropEffect = 'copy' // 宏/资源文件 -> 复制
    } else {
      e.dataTransfer.dropEffect = 'move' // 内部节点 -> 移动
    }
  }
}

const onDrop = (e: DragEvent) => {
  e.stopPropagation()
  if (!e.dataTransfer) return

  const draggedNodeId = e.dataTransfer.getData('node-id')
  const assetPath = e.dataTransfer.getData('asset/path')

  // 即使节点是折叠的，只要 Drop 到这个 Item 上，逻辑依然是“加入到该节点内部”
  if (draggedNodeId) {
     if (draggedNodeId !== props.node.id) editorActions.moveNode(draggedNodeId, props.node.id)
  } 
  else if (assetPath && assetPath.endsWith('.macro')) {
    editorActions.instantiateMacro(assetPath, props.node.id)
  }
  else if (assetPath && (assetPath.endsWith('.glb') || assetPath.endsWith('.fbx'))) {
    editorActions.addModelNode(assetPath, props.node.id)
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
      <span 
        class="fold-arrow" 
        @click.stop="toggleFold"
        @dblclick.stop
        :style="{ opacity: hasChildren ? 1 : 0, cursor: hasChildren ? 'pointer' : 'default' }"
      >
        {{ isOpen ? '▼' : '▶' }}
      </span>

      <span class="icon">
        {{ node.macro ? '📦' : (hasChildren ? '📂' : '🧊') }}
      </span> 
      
      <span 
        class="label" 
        :class="{ 'is-macro': !!node.macro }"
      >
        {{ node.name }}
      </span>
    </div>

    <div v-show="isOpen && hasChildren">
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
  /* 🟢 修改：移除固定的 padding-left，由 style 动态控制 */
  padding: 4px 10px 4px 0; 
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

/* 🟢 新增：箭头样式 */
.fold-arrow {
  width: 20px; /* 固定宽度确保对齐 */
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #888;
  flex-shrink: 0;
  transition: color 0.2s;
}
.fold-arrow:hover { color: #333; background: rgba(0,0,0,0.05); border-radius: 4px; }

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