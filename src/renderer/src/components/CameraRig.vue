<script setup lang="ts">
import { inject, shallowRef, watchEffect, ref, reactive } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'

// 1. 注入
const registry = inject<{ get: (id: string) => THREE.Object3D | undefined }>('scene-registry')
const sceneData = inject('scene-data-ref') as any

const cameraRef = shallowRef<THREE.PerspectiveCamera | null>(null)

// 状态：ID 用来找物体，Props 用来设置参数
const targetId = ref<string | null>(null)
const targetObject = shallowRef<THREE.Object3D | null>(null)

// 默认相机参数
const targetProps = reactive({
  fov: 60,
  near: 0.1,
  far: 1000
})

// 2. 辅助函数：不仅找 ID，还把找到的相机组件 Props 返回出来
const findMainCameraInfo = (nodes: any[]): { id: string, props: any } | null => {
  for (const node of nodes) {
    const camComp = node.components.find((c: any) => c.type === 'Camera' && c.props.isMain)
    if (camComp) {
      return { id: node.id, props: camComp.props }
    }
    if (node.children) {
      const found = findMainCameraInfo(node.children)
      if (found) return found
    }
  }
  return null
}

// 3. 监听数据变化 (同步 ID 和 属性)
watchEffect(() => {
  if (!sceneData?.value) return
  
  const info = findMainCameraInfo(sceneData.value)
  
  if (info) {
    // A. 处理 ID 变更
    if (info.id !== targetId.value) {
      targetId.value = info.id
      targetObject.value = null // ID 变了，丢弃旧物体，重新寻找
    }

    // B. 处理属性同步 (FOV, Near, Far)
    // Vue 的响应式系统会自动处理这里，当 Inspector 修改 props 时，这里会立即执行
    if (info.props) {
      targetProps.fov = info.props.fov || 60
      targetProps.near = info.props.near || 0.1
      targetProps.far = info.props.far || 1000
    }
  }
})

// 4. 同步循环 (位置与旋转)
const { onBeforeRender } = useLoop()
const dummyVec = new THREE.Vector3()
const dummyQuat = new THREE.Quaternion()
const dummyScale = new THREE.Vector3()

onBeforeRender(() => {
  if (!cameraRef.value) return

  // A. 迟滞绑定：尝试获取 Three.js 对象
  if (targetId.value && !targetObject.value) {
    if (registry) {
      const obj = registry.get(targetId.value)
      if (obj) {
        targetObject.value = obj
      }
    }
  }

  // B. 如果还没拿到对象，就无法同步位置
  if (!targetObject.value) return

  const target = targetObject.value

  // C. 同步矩阵 (位置 + 旋转)
  target.updateMatrixWorld(true)
  target.matrixWorld.decompose(dummyVec, dummyQuat, dummyScale)

  cameraRef.value.position.copy(dummyVec)
  cameraRef.value.quaternion.copy(dummyQuat)
  
  // 注意：FOV/Near/Far 不需要在这里更新，Vue 的响应式 Props 会自动处理
})
</script>

<template>
  <TresPerspectiveCamera
    ref="cameraRef"
    :fov="targetProps.fov"
    :near="targetProps.near"
    :far="targetProps.far"
    make-default
  />
</template>