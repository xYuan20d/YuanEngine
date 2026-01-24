<script setup lang="ts">
import { defineProps } from 'vue'
import { IGameNode } from '../types/schema'
import { useContextMenu } from '../composables/useContextMenu'

const props = defineProps<{
  node: IGameNode
}>()

const { showContextMenu } = useContextMenu()

const handleAddClick = (e: MouseEvent) => {
  // 定义菜单结构
  const menuConfig = [
    {
      label: 'Rendering',
      children: [
        { 
          label: 'Light', 
          icon: '💡',
          action: () => {
            props.node.components.push({ 
              type: 'Light', 
              props: { intensity: 1, color: '#ffffff' } 
            })
          }
        },
        {
          label: 'Mesh (Override)',
          icon: '🧊',
          action: () => {
            // 如果已有 Mesh，通常是替换还是叠加？ECS允许叠加，但渲染可能重叠
            // 这里简单 push，用户可以自己删旧的
            props.node.components.push({
               type: 'Mesh', 
               props: { geometry: 'Box', args: [1, 1, 1], color: '#ffffff' } 
            })
          }
        }
      ]
    },
    {
      label: 'Physics',
      children: [
        {
          label: 'Rigid Body',
          icon: '🍎',
          action: () => {
            // 只有挂了 RigidBody，物体才会掉下来
            // 否则它就是个静止的墙
            props.node.components.push({
              type: 'RigidBody',
              props: {
                bodyType: 'dynamic',
                mass: 1.0,
                restitution: 0.5, // 弹性
                friction: 0.5     // 摩擦
              }
            })
          }
        }
      ]
    },
    {
      label: 'Scripts',
      children: [
        { 
          label: 'New Script', 
          icon: '📜',
          action: () => {
            props.node.components.push({ 
              type: 'Script', 
              props: { 
                src: '', // 留空让用户填写路径
                userValues: {} 
              } 
            })
          } 
        }
      ]
    },
    { separator: true },
    {
       label: 'Physics (Coming Soon)',
       disabled: true
    }
  ]

  showContextMenu(e, menuConfig)
}
</script>

<template>
  <button class="add-component-btn" @click.stop="handleAddClick">
    Add Component
  </button>
</template>

<style scoped>
.add-component-btn {
  width: 100%; 
  padding: 8px; 
  margin-top: 15px; /* 增加一点顶部间距 */
  background: #fff; 
  border: 1px solid #dcdfe6; 
  border-radius: 4px;
  color: #606266; 
  font-size: 12px; 
  font-weight: 600;
  cursor: pointer; 
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-component-btn:hover { 
  border-color: #409eff; 
  color: #409eff; 
  background: #ecf5ff; 
}

.add-component-btn:active {
  background: #d9ecff;
}
</style>