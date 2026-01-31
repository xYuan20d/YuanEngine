<script setup lang="ts">
import { inject, shallowRef, watchEffect, ref, reactive } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'
import { flattenProps } from '../utils/props' // 🟢 1. 引入解压工具

// 1. 注入
const registry = inject<{ get: (id: string) => THREE.Object3D | undefined }>('scene-registry')
const sceneData = inject('scene-data-ref') as any

const cameraRef = shallowRef<THREE.PerspectiveCamera | null>(null)

// 状态
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
  if (!nodes) return null
  
  for (const node of nodes) {
    // 🟢 2. 这里必须解压！否则 { value: false } 也会被当成 true
    const camComp = node.components.find((c: any) => {
      if (c.type !== 'Camera') return false
      const flat = flattenProps(c.props)
      return flat.isMain === true
    })

    if (camComp) {
      // 🟢 3. 返回解压后的 props
      return { id: node.id, props: flattenProps(camComp.props) }
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

    // B. 处理属性同步
    // 🟢 4. info.props 现在已经是纯数字了，Three.js 不会崩了
    if (info.props) {
      targetProps.fov = info.props.fov ?? 60
      targetProps.near = info.props.near ?? 0.1
      targetProps.far = info.props.far ?? 1000
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
  if (target.matrixWorld) {
    target.updateMatrixWorld(true)
    target.matrixWorld.decompose(dummyVec, dummyQuat, dummyScale)

    cameraRef.value.position.copy(dummyVec)
    cameraRef.value.quaternion.copy(dummyQuat)
  }
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