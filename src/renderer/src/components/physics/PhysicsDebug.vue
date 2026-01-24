<script setup lang="ts">
import { inject, onUnmounted, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'
import type RAPIER_TYPE from '@dimforge/rapier3d-compat'

const world = inject<shallowRef<RAPIER_TYPE.World>>('physics-world')!.value
const lineSegmentsRef = shallowRef<THREE.LineSegments | null>(null)

// 创建 Line Geometry
const geometry = new THREE.BufferGeometry()
const material = new THREE.LineBasicMaterial({ color: 0x00ff00, vertexColors: true })

const { onBeforeRender } = useLoop()

onBeforeRender(() => {
  if (!world || !lineSegmentsRef.value) return

  // 获取 Rapier 的调试数据
  const { vertices, colors } = world.debugRender()

  // 更新 Three.js 几何体
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  
  // 告诉 GPU 更新
  geometry.attributes.position.needsUpdate = true
  geometry.attributes.color.needsUpdate = true
})
</script>

<template>
  <TresLineSegments ref="lineSegmentsRef" :geometry="geometry" :material="material" />
</template>