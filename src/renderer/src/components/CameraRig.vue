<script setup lang="ts">
import { inject, shallowRef, watchEffect, ref, reactive } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'
import { flattenProps } from '../utils/props'

// 🟢 1. 接收外部传入的相机对象
const props = defineProps<{
  cameraObject?: THREE.PerspectiveCamera | null
}>()

const registry = inject<{ get: (id: string) => THREE.Object3D | undefined }>('scene-registry')
const sceneData = inject('scene-data-ref') as any

// 状态
const targetId = ref<string | null>(null)
const targetObject = shallowRef<THREE.Object3D | null>(null)

// 游戏内定义的相机参数
const targetProps = reactive({
  fov: 60,
  near: 0.1,
  far: 1000
})

// 辅助函数：查找主相机信息
const findMainCameraInfo = (nodes: any[]): { id: string, props: any } | null => {
  if (!nodes) return null
  for (const node of nodes) {
    const camComp = node.components.find((c: any) => {
      if (c.type !== 'Camera') return false
      const flat = flattenProps(c.props)
      return flat.isMain === true
    })
    if (camComp) return { id: node.id, props: flattenProps(camComp.props) }
    if (node.children) {
      const found = findMainCameraInfo(node.children)
      if (found) return found
    }
  }
  return null
}

// 监听数据变化 (同步 ID 和 属性)
watchEffect(() => {
  if (!sceneData?.value) return
  const info = findMainCameraInfo(sceneData.value)
  
  if (info) {
    if (info.id !== targetId.value) {
      targetId.value = info.id
      targetObject.value = null 
    }
    if (info.props) {
      targetProps.fov = info.props.fov ?? 60
      targetProps.near = info.props.near ?? 0.1
      targetProps.far = info.props.far ?? 1000
    }
  }
})

// 🟢 2. 监听参数变化，直接修改传入的相机对象
watchEffect(() => {
  if (props.cameraObject) {
    props.cameraObject.fov = targetProps.fov
    props.cameraObject.near = targetProps.near
    props.cameraObject.far = targetProps.far
    props.cameraObject.updateProjectionMatrix() // 必须调用，否则改了 FOV 没反应
  }
})

// 同步循环 (位置与旋转)
const { onBeforeRender } = useLoop()
const dummyVec = new THREE.Vector3()
const dummyQuat = new THREE.Quaternion()
const dummyScale = new THREE.Vector3()

onBeforeRender(() => {
  // 🟢 3. 操作传入的 props.cameraObject，而不是自己的 cameraRef
  if (!props.cameraObject) return

  // 尝试获取目标
  if (targetId.value && !targetObject.value && registry) {
    const obj = registry.get(targetId.value)
    if (obj) targetObject.value = obj
  }

  if (!targetObject.value) return

  const target = targetObject.value
  if (target.matrixWorld) {
    target.updateMatrixWorld(true)
    target.matrixWorld.decompose(dummyVec, dummyQuat, dummyScale)

    // 将物理相机移动到目标位置
    props.cameraObject.position.copy(dummyVec)
    props.cameraObject.quaternion.copy(dummyQuat)
  }
})
</script>

<template>
  <slot />
</template>