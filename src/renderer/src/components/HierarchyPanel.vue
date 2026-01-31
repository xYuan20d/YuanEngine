<script setup lang="ts">
import { inject } from 'vue'
import { IGameNode } from '../types/schema'
import { useContextMenu } from '../composables/useContextMenu'
import HierarchyItem from './HierarchyItem.vue'

defineProps<{
  nodes: IGameNode[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const { showContextMenu } = useContextMenu()
const editorActions = inject<any>('editor-actions')

// 右键菜单逻辑保持不变
const handleContextMenu = (e: MouseEvent, node?: IGameNode) => {
  // node 存在：右键点击了物体
  // node 不存在：右键点击了空白处
  const targetId = node?.id || null

  const menuConfig: any[] = []

  // 🟢 1. 如果点击了节点，显示 "Copy"
  if (node) {
    menuConfig.push({
      label: 'Copy',
      icon: '📄',
      action: () => editorActions.copyNode(node.id)
    })
  }

  // 🟢 2. 无论点哪，都显示 "Paste" (具体的粘贴位置由 targetId 决定)
  // 注意：这里其实可以优化，比如检查 clipboard 是否为空来决定是否禁用 Paste
  // 但因为 clipboard 在 App.vue 里，这里简单处理，总是显示
  menuConfig.push({
    label: 'Paste',
    icon: '📋',
    action: () => editorActions.pasteNode(targetId)
  })

  // 分隔线
  menuConfig.push({ separator: true })

  // 🟢 3. 原有的 Create Object 菜单
  menuConfig.push({
    label: 'Create Object',
    children: [
      { 
        label: 'Empty Object', 
        icon: '⬜', 
        action: () => editorActions.addNode('Empty', 'Empty', targetId) 
      },
      { separator: true },
      {
        label: '3D Mesh',
        children: [
          { label: 'Cube', action: () => editorActions.addNode('Mesh', 'Box', targetId) },
          { label: 'Sphere', action: () => editorActions.addNode('Mesh', 'Sphere', targetId) },
          { label: 'Plane', action: () => editorActions.addNode('Mesh', 'Plane', targetId) }
        ]
      },
      { 
        label: 'Camera', 
        icon: '🎥', 
        action: () => editorActions.addNode('Camera', 'Perspective', targetId) 
      },
      {
        label: 'Light',
        children: [
          { label: 'Point Light', action: () => editorActions.addNode('Light', 'Point', targetId) },
          { label: 'Directional Light', action: () => editorActions.addNode('Light', 'Directional', targetId) }
        ]
      }
    ]
  })

  // 🟢 4. 只有点击节点时才显示删除
  if (node) {
    menuConfig.push({ separator: true })
    menuConfig.push({ 
      label: 'Delete', 
      icon: '🗑️',
      action: () => editorActions.deleteNode(node.id)
    })
  }

  showContextMenu(e, menuConfig)
}

// 空白区域拖拽处理
const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
}

const onDrop = (e: DragEvent) => {
  if (e.dataTransfer) {
    const draggedNodeId = e.dataTransfer.getData('node-id')
    
    if (draggedNodeId) {
      // 拖拽到根目录
      editorActions.moveNode(draggedNodeId, null)
    }
  }
}

// 在空白区域点击时取消选中
const onEmptyAreaClick = () => {
  emit('select', '')
}
</script>

<template>
  <div class="panel-content" @contextmenu.prevent="(e) => handleContextMenu(e)">
    <div class="panel-header">Hierarchy</div>
    <div 
      class="tree-container"
      @dragover.prevent="onDragOver"
      @drop="onDrop"
    >
      <HierarchyItem 
        v-for="node in nodes" 
        :key="node.id"
        :node="node"
        :selected-id="selectedId"
        :level="0"
        @select="(id) => emit('select', id)"
        @contextmenu="(e, n) => handleContextMenu(e, n)"
      />

      <div 
        class="empty-area" 
        style="flex: 1; min-height: 50px;" 
        @click.self="onEmptyAreaClick"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.panel-content { 
  display: flex; 
  flex-direction: column; 
  height: 100%; 
}

.panel-header {
  height: 36px; 
  line-height: 36px; 
  padding-left: 15px;
  font-size: 11px; 
  font-weight: 600; 
  text-transform: uppercase;
  background: #f1f3f5; 
  color: #666; 
  border-bottom: 1px solid #e0e0e0;
  user-select: none;
}

.tree-container { 
  padding: 4px 0; 
  overflow-y: auto; 
  flex: 1; 
  display: flex; 
  flex-direction: column; 
}

.empty-area {
  border: 2px dashed transparent;
  transition: border-color 0.2s;
  margin: 4px;
}

.empty-area:hover {
  border-color: #e0e0e0;
}
</style>