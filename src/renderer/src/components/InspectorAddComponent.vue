<script setup lang="ts">
import { IGameNode } from '../types/schema'
import { useContextMenu } from '../composables/useContextMenu'

const props = defineProps<{
  node: IGameNode
}>()

const { showContextMenu } = useContextMenu()

const handleAddClick = (e: MouseEvent) => {
  const menuConfig: any = [
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
            props.node.components.push({
              type: 'RigidBody',
              props: {
                bodyType: 'dynamic',
                mass: 1.0,
                restitution: 0.5,
                friction: 0.5
              }
            })
          }
        },
        // 🟢 新增：车辆系统分隔线
        { separator: true },
        {
          label: 'Vehicle Chassis',
          icon: '🚗',
          action: () => {
            // 车身组件：默认给一点重心下移，防止翻车
            props.node.components.push({
              type: 'VehicleChassis',
              props: {
                // Y轴下移 0.5 米，让重心在底盘下方
                centerOfMassOffset: [0, -0.5, 0] 
              }
            })
          }
        },
        {
          label: 'Vehicle Wheel',
          icon: '🛞',
          action: () => {
            // 车轮组件：默认参数
            props.node.components.push({
              type: 'VehicleWheel',
              props: {
                isSteering: false, // 默认不转向
                isDrive: false,    // 默认不驱动
                radiusScale: 1.0,  // 自动计算半径
                suspensionRestLength: 0.3, // 悬挂长度
                suspensionStiffness: 50.0, // 硬度
                maxSuspensionTravel: 0.2,  // 行程
                brakeForce: 1.0
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
                src: '', 
                userValues: {} 
              } 
            })
          } 
        }
      ]
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
/* 样式保持不变 */
.add-component-btn {
  width: 100%; 
  padding: 8px; 
  margin-top: 15px; 
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