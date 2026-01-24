<script setup lang="ts">
import { provide, toRef, onUnmounted } from 'vue'
import { TresCanvas } from '@tresjs/core'
import * as THREE from 'three'
import { IGameNode } from '../types/schema'

// 组件引入
import GameEntity from './GameEntity.vue'
import CameraRig from './CameraRig.vue' 
import PhysicsSystem from './physics/PhysicsSystem.vue'
import PhysicsDebug from './physics/PhysicsDebug.vue'
import { Input } from '../engine/Engine'

const props = defineProps<{
  sceneData: IGameNode[] 
}>()

// 🟢 1. 恢复：场景物体注册表 (CameraRig 和 Script 强依赖这个)
const objectMap = new Map<string, THREE.Object3D>()
const register = (id: string, obj: THREE.Object3D) => objectMap.set(id, obj)
const unregister = (id: string) => objectMap.delete(id)
const get = (id: string) => objectMap.get(id)

provide('scene-registry', { register, unregister, get })

// 🟢 2. 恢复：提供场景数据引用给 CameraRig 查找主相机
provide('scene-data-ref', toRef(props, 'sceneData'))

provide('is-playing', { value: true })

// 退出播放模式时解锁鼠标
onUnmounted(() => {
  Input.unlockCursor()
})
</script>

<template>
  <TresCanvas clear-color="#E8FAFF" shadows>
    <PhysicsSystem>
      <PhysicsDebug />
      
      <CameraRig />

      <GameEntity 
        v-for="node in sceneData"
        :key="node.id"
        :node="node" 
      />
      
      <TresAmbientLight :intensity="0.5" />
    </PhysicsSystem>
  </TresCanvas>
</template>