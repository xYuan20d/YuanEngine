<script setup lang="ts">
import { inject, computed, watch, shallowRef } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'

const props = defineProps<{
  fov: number
  near: number
  far: number
  color?: string
}>()

const isPlaying = inject('is-playing', { value: false })

// --- 1. 视锥体辅助线逻辑 ---
// 我们需要实例化一个“幽灵相机”，它不参与渲染，只用来计算 Helper 的形状
const dummyCam = new THREE.PerspectiveCamera(props.fov, 1, props.near, props.far)
const helperRef = shallowRef<THREE.CameraHelper | null>(null)

// 当属性变化时，更新幽灵相机，从而更新 Helper
watch(() => [props.fov, props.near, props.far], () => {
  dummyCam.fov = props.fov
  dummyCam.near = props.near
  dummyCam.far = props.far
  dummyCam.updateProjectionMatrix()
  
  if (helperRef.value) {
    helperRef.value.update()
  }
}, { immediate: true })

</script>

<template>
  <TresGroup v-if="!isPlaying.value">
    
    <TresGroup :rotation="[0, Math.PI, 0]">
      <TresMesh :position="[0, 0, 0]">
        <TresBoxGeometry :args="[0.4, 0.4, 0.6]" />
        <TresMeshStandardMaterial color="#333" :roughness="0.8" />
      </TresMesh>
      
      <TresMesh :position="[0, 0, 0.45]" :rotation="[Math.PI / 2, 0, 0]">
        <TresCylinderGeometry :args="[0.15, 0.15, 0.4, 16]" />
        <TresMeshStandardMaterial color="#111" />
      </TresMesh>
      
      <TresMesh :position="[0, 0, 0.66]" :rotation="[Math.PI / 2, 0, 0]">
        <TresCircleGeometry :args="[0.12, 16]" />
        <TresMeshStandardMaterial color="#409eff" :metalness="0.9" :roughness="0.1" />
      </TresMesh>

      <TresMesh :position="[0, 0.25, -0.15]" :rotation="[0, 0, Math.PI / 2]">
        <TresCylinderGeometry :args="[0.15, 0.15, 0.3, 16]" />
        <TresMeshStandardMaterial color="#444" />
      </TresMesh>
    </TresGroup>

    <TresCameraHelper ref="helperRef" :args="[dummyCam]" />

  </TresGroup>
</template>