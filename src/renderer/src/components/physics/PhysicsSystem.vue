<script setup lang="ts">
import { onMounted, onUnmounted, provide, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import RAPIER from '@dimforge/rapier3d-compat'
import { Time, Input } from '../../engine/Engine'

const isReady = shallowRef(false)
const world = shallowRef<RAPIER.World | null>(null)

const preStepCallbacks = new Set<() => void>()
const registerPreStep = (cb: () => void) => preStepCallbacks.add(cb)
const unregisterPreStep = (cb: () => void) => preStepCallbacks.delete(cb)

provide('physics-world', world)
provide('rapier-instance', RAPIER)
provide('physics-pre-step', { register: registerPreStep, unregister: unregisterPreStep })

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
  Input.unlockCursor()
  preStepCallbacks.clear()
})

const { onBeforeRender } = useLoop()

// 🟢 任务 1：输入系统快照 (优先级 999)
// 这是每一帧做的第一件事！确保后续所有逻辑读到的输入都是一致的
onBeforeRender(() => {
  Input.update()
}, 999)

// 🟢 任务 2：物理模拟 (优先级 1)
onBeforeRender(({ delta, elapsed }) => {
  Time.deltaTime = delta
  Time.time = elapsed

  if (world.value && isReady.value) {
    // 亚步进逻辑
    const substeps = 4;
    const subDt = 1 / (60 * substeps);
    world.value.timestep = subDt;

    for (let i = 0; i < substeps; i++) {
      preStepCallbacks.forEach(cb => cb())
      world.value.step()
    }
  }
}, 1)

// 任务 3 (默认 ScriptRunner 优先级是 0)，会在上面两个之后执行
// 此时 Script 读取的是 Input 的快照，稳得一批。

</script>

<template>
  <slot v-if="isReady" />
</template>