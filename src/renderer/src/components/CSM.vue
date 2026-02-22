<script setup lang="ts">
import { onUnmounted, provide, watchEffect } from 'vue'
import { useTresContext, useLoop } from '@tresjs/core'
import * as THREE from 'three'
import CSM from 'three-csm'

const props = defineProps<{
  cascades?: number
  maxFar?: number
  shadowMapSize?: number
  intensity?: number
  shadowBias?: number
}>()

const { camera, scene, renderer } = useTresContext()
const { onBeforeRender } = useLoop()
const cam = camera as any

let csmInstance: any = null

// --- 核心逻辑：初始化 ---
const initCSM = () => {
  if (!(cam).value || !scene.value) return
  
  if (csmInstance) csmInstance.dispose()

  // 必须确保渲染器开启了阴影
  let rend = renderer as any
  rend.value.shadowMap.enabled = true
  rend.value.shadowMap.type = THREE.PCFSoftShadowMap

  csmInstance = new CSM({
    maxFar: props.maxFar || cam.value.far,
    cascades: props.cascades || 4,
    shadowMapSize: props.shadowMapSize || 2048,
    lightDirection: new THREE.Vector3(1, -1, 1).normalize(),
    camera: cam.value as THREE.PerspectiveCamera,
    parent: scene.value as any,
    mode: 'practical'
  })

  csmInstance.fade = true
  csmInstance.lightIntensity = props.intensity ?? 1.5
}

// --- 核心能力：材质注册 ---
// 我们通过 provide 提供这个方法，子组件（如 GameEntity）渲染出材质后调用它
const setupMaterial = (material: THREE.Material) => {
  if (csmInstance && material) {
    csmInstance.setupMaterial(material)
  }
}

provide('csm-setup-material', setupMaterial)

// 每帧更新级联位置
onBeforeRender(() => {
  if (csmInstance && cam.value) {
    csmInstance.update()
  }
})

// 监听参数变化
watchEffect(() => {
  if (!csmInstance) {
    initCSM()
  } else {
    // 动态调整参数 (部分参数需要调 updateFrustums)
    csmInstance.lightIntensity = props.intensity ?? 1.5
  }
})

onUnmounted(() => {
  if (csmInstance) csmInstance.dispose()
})
</script>

<template>
  <slot />
</template>