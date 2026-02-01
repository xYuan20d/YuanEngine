<script setup lang="ts">
import { ref, watch, onUnmounted, inject, shallowRef } from 'vue'
import { useGLTF } from '@tresjs/cientos'
import { FileSystem } from '../engine/FileSystem'
import * as THREE from 'three'

const props = defineProps<{
  nodeId: string // 当前节点的 ID，用于注册
  src: string    // 模型路径 (相对路径)
}>()

const projectRoot = inject('project-root') as any
const modelScene = shallowRef<THREE.Group | null>(null)
let objectUrl: string | null = null

// 加载模型
const loadModel = async () => {
  if (!projectRoot.value || !props.src) return

  try {
    // 1. 获取绝对路径
    const fullPath = await FileSystem.pathJoin(projectRoot.value, props.src)
    
    // 2. 读取二进制数据
    const res = await FileSystem.readBuffer(fullPath)
    if (!res.success || !res.data) {
      console.error(`Failed to load model: ${props.src}`, res.error)
      return
    }

    // 3. 创建 Blob URL (绕过文件路径的安全限制，同时支持 buffer 加载)
    const blob = new Blob([res.data])
    if (objectUrl) URL.revokeObjectURL(objectUrl) // 清理旧的
    objectUrl = URL.createObjectURL(blob)

    // 4. 使用 useGLTF 加载
    // useGLTF 会自动处理 Draco 压缩等复杂情况
    const { scene } = await useGLTF(objectUrl)
    
    // 5. 开启阴影
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    modelScene.value = scene
    
  } catch (e) {
    console.error('GLTF loading error:', e)
  }
}

watch(() => props.src, loadModel, { immediate: true })

onUnmounted(() => {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
})
</script>

<template>
  <primitive v-if="modelScene" :object="modelScene" />
</template>