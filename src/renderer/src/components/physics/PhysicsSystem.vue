<script setup lang="ts">
import { onMounted, onUnmounted, provide, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import RAPIER from '@dimforge/rapier3d-compat'
import { Time, Input } from '../../engine/Engine' // 🟢 确保路径正确

const isReady = shallowRef(false)
const world = shallowRef<RAPIER.World | null>(null)

provide('physics-world', world)
provide('rapier-instance', RAPIER)

onMounted(async () => {
  try {
    await RAPIER.init()
    const gravity = { x: 0.0, y: -9.81, z: 0.0 }
    world.value = new RAPIER.World(gravity)
    isReady.value = true
  } catch (e) {
    console.error('Rapier init failed', e)
  }
})

onUnmounted(() => {
  if (world.value) world.value.free()
  // 🟢 退出时解锁鼠标
  Input.unlockCursor()
})

// 🟢 修复核心：只取 onBeforeRender，不取 onAfterRender
const { onBeforeRender } = useLoop()

onBeforeRender(({ delta, elapsed }) => {
  // 1. 更新全局时间
  Time.deltaTime = delta
  Time.time = elapsed

  // 2. 物理步进
  if (world.value && isReady.value) {
    world.value.step()
  }
  
  // 🟢 3. 帧末重置 (替代 onAfterRender)
  // 使用 setTimeout(0) 将重置逻辑推到当前帧的最后执行
  // 这样保证了所有脚本在 onUpdate 里都能读到当前的 Input
  setTimeout(() => {
    Input._resetFrame()
  }, 0)
})
</script>

<template>
  <slot v-if="isReady" />
</template>