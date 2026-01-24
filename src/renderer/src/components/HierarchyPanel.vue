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
  const parentId = node?.id

  const menuConfig = [
    {
      label: 'Create Object',
      children: [
        {
          label: '3D Mesh',
          children: [
            { label: 'Cube', action: () => editorActions.addNode('Mesh', 'Box', parentId) },
            { label: 'Sphere', action: () => editorActions.addNode('Mesh', 'Sphere', parentId) },
            { label: 'Plane', action: () => editorActions.addNode('Mesh', 'Plane', parentId) }
          ]
        },
        { 
        label: 'Camera', 
        icon: '🎥', 
        action: () => editorActions.addNode('Camera', 'Perspective', parentId) 
        },
        {
          label: 'Light',
          children: [
            { label: 'Point Light', action: () => editorActions.addNode('Light', 'Point', parentId) },
            { label: 'Directional Light', action: () => editorActions.addNode('Light', 'Directional', parentId) }
          ]
        }
      ]
    },
    { separator: true },
    { 
      label: 'Delete', 
      disabled: !node, 
      action: () => {
        if (node) {
          // 调用注入的删除动作
          editorActions.deleteNode(node.id)
        }
      }
    }
  ]

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