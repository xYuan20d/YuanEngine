<script setup lang="ts">
import { inject } from 'vue'
import { IGameNode } from '../types/schema'
import { useContextMenu } from '../composables/useContextMenu'
import HierarchyItem from './HierarchyItem.vue' // [新增] 引入递归组件

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
</script>

<template>
  <div class="panel-content" @contextmenu.prevent="(e) => handleContextMenu(e)">
    <div class="panel-header">Hierarchy</div>
    <div class="tree-container">
      
      <HierarchyItem 
        v-for="node in nodes" 
        :key="node.id"
        :node="node"
        :selected-id="selectedId"
        :level="0"
        @select="(id) => emit('select', id)"
        @contextmenu="(e, n) => handleContextMenu(e, n)"
      />

      <div class="empty-area" style="flex: 1; min-height: 50px;" @click.self="emit('select', '')"></div>
    </div>
  </div>
</template>

<style scoped>
.panel-content { display: flex; flex-direction: column; height: 100%; }
.panel-header {
  height: 36px; line-height: 36px; padding-left: 15px;
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  background: #f1f3f5; color: #666; border-bottom: 1px solid #e0e0e0;
  user-select: none;
}
.tree-container { padding: 4px 0; overflow-y: auto; flex: 1; display: flex; flex-direction: column; }
</style>