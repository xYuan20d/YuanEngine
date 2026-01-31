<script setup lang="ts">
import { inject, onMounted, onUnmounted, provide, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import RAPIER from '@dimforge/rapier3d-compat'
import { Time, Input } from '../../engine/Engine'
import * as THREE from 'three' // 🟢 2. 引入 THREE 用于类型检查

const isReady = shallowRef(false)
const world = shallowRef<RAPIER.World | null>(null)
// 🟢 1. 新增：事件队列变量 (不需要响应式，普通变量即可)
let eventQueue: RAPIER.EventQueue | null = null

const preStepCallbacks = new Set<() => void>()
const registerPreStep = (cb: () => void) => preStepCallbacks.add(cb)
const unregisterPreStep = (cb: () => void) => preStepCallbacks.delete(cb)

const objectRegistry = inject<{ get: (id: string) => THREE.Object3D }>('scene-registry')

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
    await RAPIER.init();

    (window as any).RAPIER = RAPIER;

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

  if (world.value && isReady.value && eventQueue) {
    const substeps = 4;
    const subDt = 1 / (60 * substeps);
    world.value.timestep = subDt;

    for (let i = 0; i < substeps; i++) {
      preStepCallbacks.forEach(cb => cb())
      world.value.step(eventQueue)

      // 🟢 4. 事件分发逻辑
      eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        // A. 查表翻译 ID
        const id1 = getNodeByCollider(handle1)
        const id2 = getNodeByCollider(handle2)
        
        // 只有双方都是注册过的游戏物体才处理
        if (!id1 || !id2) return

        // B. 获取真正的 GameObject (Object3D)
        // 这一步至关重要，因为脚本实例在 obj.userData.scripts 里
        const obj1 = objectRegistry?.get(id1)
        const obj2 = objectRegistry?.get(id2)

        if (obj1 && obj2) {
          
          // C. 定义分发函数 (Helper)
          const dispatch = (target: THREE.Object3D, other: THREE.Object3D) => {
            // 检查该物体上有没有脚本
            if (!target.userData.scripts || !Array.isArray(target.userData.scripts)) return

            // 遍历所有脚本并调用回调
            target.userData.scripts.forEach((script: any) => {
              try {
                if (started) {
                  // 进入事件：优先调用 onTriggerEnter
                  // (你也可以在这里判断 isSensor，如果不是 Sensor 则调用 onCollisionEnter)
                  if (script.onTriggerEnter) script.onTriggerEnter(other)
                  else if (script.onCollisionEnter) script.onCollisionEnter(other)
                } else {
                  // 离开事件
                  if (script.onTriggerExit) script.onTriggerExit(other)
                  else if (script.onCollisionExit) script.onCollisionExit(other)
                }
              } catch (e) {
                console.error(`[Physics Error] Script callback failed on ${target.name}:`, e)
              }
            })
          }

          // D. 双向通知：A 撞了 B，B 也撞了 A
          dispatch(obj1, obj2)
          dispatch(obj2, obj1)
          
          // 调试日志 (可选保留)
          // const type = started ? '🟢 Enter' : '🔴 Exit'
          // console.log(`[Physics Event] ${type}: ${obj1.name} <-> ${obj2.name}`)
        }
      })
    }
  }
}, 1)

</script>

<template>
  <slot v-if="isReady" />
</template>