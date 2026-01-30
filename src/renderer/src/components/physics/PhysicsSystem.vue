<script setup lang="ts">
import { onMounted, onUnmounted, provide, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import RAPIER from '@dimforge/rapier3d-compat'
import { Time, Input } from '../../engine/Engine'

const isReady = shallowRef(false)
const world = shallowRef<RAPIER.World | null>(null)
// 🟢 1. 新增：事件队列变量 (不需要响应式，普通变量即可)
let eventQueue: RAPIER.EventQueue | null = null

const preStepCallbacks = new Set<() => void>()
const registerPreStep = (cb: () => void) => preStepCallbacks.add(cb)
const unregisterPreStep = (cb: () => void) => preStepCallbacks.delete(cb)

// 碰撞体句柄 -> 节点 ID 的查找表
const colliderMap = new Map<number, string>()

provide('physics-world', world)
provide('rapier-instance', RAPIER)
provide('physics-pre-step', { register: registerPreStep, unregister: unregisterPreStep })

// --- 注册表逻辑 ---

const registerCollider = (handle: number, nodeId: string) => {
  colliderMap.set(handle, nodeId)
  // console.log(`[Physics] Registered: Handle ${handle} -> Node ${nodeId}`)
}

const unregisterCollider = (handle: number) => {
  if (colliderMap.has(handle)) {
    colliderMap.delete(handle)
  }
}

const getNodeByCollider = (handle: number): string | undefined => {
  return colliderMap.get(handle)
}

provide('collision-registry', { 
  register: registerCollider, 
  unregister: unregisterCollider,
  getNode: getNodeByCollider
})

// --- 生命周期 ---

onMounted(async () => {
  try {
    await RAPIER.init()
    const gravity = { x: 0.0, y: -9.81, z: 0.0 }
    world.value = new RAPIER.World(gravity)
    
    // 🟢 2. 新增：初始化事件队列
    // 参数 true 表示自动清除上一帧的旧事件
    eventQueue = new RAPIER.EventQueue(true)
    
    isReady.value = true
  } catch (e) {
    console.error('Rapier init failed', e)
  }
})

onUnmounted(() => {
  if (world.value) world.value.free()
  
  // 🟢 3. 新增：释放事件队列内存
  if (eventQueue) eventQueue.free()
  
  colliderMap.clear()
  Input.unlockCursor()
  preStepCallbacks.clear()
})

const { onBeforeRender } = useLoop()

// 🟢 任务 1：输入系统快照 (优先级 999)
onBeforeRender(() => {
  Input.update()
}, 999)

// 🟢 任务 2：物理模拟 (优先级 1)
onBeforeRender(({ delta, elapsed }) => {
  Time.deltaTime = delta
  Time.time = elapsed

  // 必须确保 world, isReady 以及 eventQueue 都准备好了
  if (world.value && isReady.value && eventQueue) {
    // 亚步进逻辑 (Sub-stepping)
    const substeps = 4;
    const subDt = 1 / (60 * substeps);
    world.value.timestep = subDt;

    for (let i = 0; i < substeps; i++) {
      preStepCallbacks.forEach(cb => cb())
      
      // 🟢 4. 修改：将 eventQueue 传入 step
      // 只有传了它，Rapier 才会把碰撞事件写入队列
      world.value.step(eventQueue)

      // 🟢 5. 新增：排空并处理事件 (Drain)
      // 这个回调函数会为每一个发生的碰撞事件执行一次
      eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        // A. 查表翻译 ID
        const node1 = getNodeByCollider(handle1)
        const node2 = getNodeByCollider(handle2)

        // B. 只有当双方都已注册（都是我们管理的 GameEntity）时才处理
        if (node1 && node2) {
          const type = started ? '🟢 Enter' : '🔴 Exit'
          
          // C. 打印日志验证 (下一步我们将把它替换为脚本调用)
          console.log(`[Physics Event] ${type}: ${node1} <-> ${node2}`)
        }
      })
    }
  }
}, 1)

</script>

<template>
  <slot v-if="isReady" />
</template>