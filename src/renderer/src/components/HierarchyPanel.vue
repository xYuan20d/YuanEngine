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

// 🟢 右键菜单 (保留宏功能)
const handleContextMenu = (e: MouseEvent, node?: IGameNode) => {
  const targetId = node?.id || null
  const menuConfig: any[] = []

  // 1. Copy
  if (node) {
    menuConfig.push({
      label: 'Copy',
      icon: '📄',
      action: () => editorActions.copyNode(node.id)
    })
  }

  // 2. Paste
  menuConfig.push({
    label: 'Paste',
    icon: '📋',
    action: () => editorActions.pasteNode(targetId)
  })

  menuConfig.push({ separator: true })

  // 3. Create Object
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

  // 4. Delete & Save Macro
  if (node) {
    menuConfig.push({ separator: true })
    menuConfig.push({
      label: 'Save as Macro',
      icon: '📦',
      action: () => editorActions.createMacroFromNode(node.id)
    })
    menuConfig.push({ 
      label: 'Delete', 
      icon: '🗑️',
      action: () => editorActions.deleteNode(node.id)
    })
  }

  showContextMenu(e, menuConfig)
}

// 🟢 修复后的 DragOver：不再严格检查，默认允许，防止回弹
const onDragOver = (e: DragEvent) => {
  e.preventDefault() // 必须调用，否则 drop 不会触发
  
  if (e.dataTransfer) {
    // 尝试识别类型以优化光标，但如果有问题，保底也是 move
    const isAsset = e.dataTransfer.types.includes('asset/path')
    
    if (isAsset) {
      e.dataTransfer.dropEffect = 'copy' // 宏是复制进来
    } else {
      e.dataTransfer.dropEffect = 'move' // 内部节点是移动
    }
  }
}

// 🟢 Drop：在这里做严格处理
const onDrop = (e: DragEvent) => {
  if (!e.dataTransfer) return

  // 尝试获取两种数据
  const draggedNodeId = e.dataTransfer.getData('node-id')
  const assetPath = e.dataTransfer.getData('asset/path')

  // 情况 A: 内部节点移动 (拖到根目录)
  if (draggedNodeId) {
    editorActions.moveNode(draggedNodeId, null)
  }
  // 情况 B: 宏实例化 (拖到根目录)
  else if (assetPath && assetPath.endsWith('.macro')) {
    editorActions.instantiateMacro(assetPath, null)
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
/* 样式保持不变 */
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