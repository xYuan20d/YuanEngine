<script setup lang="ts">
import { computed, inject, onUnmounted, shallowRef, watch, provide, ref } from 'vue'
import { IGameNode } from '../types/schema'
import * as THREE from 'three'
import CameraGizmo from './CameraGizmo.vue' 
import ScriptRunner from './ScriptRunner.vue'
import PhysicsItem from './physics/PhysicsItem.vue' // 确保引入

defineOptions({ name: 'GameEntity' })

const props = defineProps<{ node: IGameNode }>()

const registry = inject<{ 
  register: (id: string, obj: THREE.Object3D) => void,
  unregister: (id: string) => void
}>('scene-registry')

const groupRef = shallowRef<THREE.Group | null>(null)
const isPlaying = inject('is-playing', { value: false })

// 🟢 1. 刚体接力系统
// A. 接收上级传下来的刚体 (可能是父亲的，也可能是爷爷的)
const upstreamBodyRef = inject('parent-body-ref', ref(null))

// B. 定义我自己创建的刚体 (如果有)
const myBodyRef = shallowRef(null)

// C. 判断我是否是“刚体拥有者”
const hasRigidBodyComponent = computed(() => 
  props.node.components.some(c => c.type === 'RigidBody')
)

// D. 决定传给孩子什么：我有刚体就传我的，没有就透传上级的
const bodyToProvide = computed(() => 
  hasRigidBodyComponent.value ? myBodyRef.value : upstreamBodyRef.value
)

// E. 向下提供 (Provide)
provide('parent-body-ref', bodyToProvide)

// F. 回调：当 PhysicsItem 创建完刚体后，通知我更新 myBodyRef
const onPhysicsCreated = (body: any) => {
  myBodyRef.value = body
}

// ... 常规注册逻辑 ...
watch(groupRef, (group) => {
  if (group && registry) registry.register(props.node.id, group)
}, { immediate: true })

onUnmounted(() => {
  if (registry) registry.unregister(props.node.id)
})

const position = computed(() => [...props.node.position])
const rotation = computed(() => [...props.node.rotation])
const scale = computed(() => [...props.node.scale])
</script>

<template>
  <TresGroup
    ref="groupRef"
    :position="position" 
    :rotation="rotation" 
    :scale="scale"     
    :user-data="{ id: node.id }" 
  >
    <template v-for="(comp, index) in node.components" :key="index">
      
      <TresMesh v-if="comp.type === 'Mesh'">
        <TresBoxGeometry v-if="comp.props.geometry === 'Box'" :args="comp.props.args" />
        <TresSphereGeometry v-else-if="comp.props.geometry === 'Sphere'" :args="comp.props.args" />
        <TresPlaneGeometry v-else-if="comp.props.geometry === 'Plane'" :args="comp.props.args" />
        <TresMeshStandardMaterial :color="comp.props.color" />
      </TresMesh>

      <ScriptRunner 
        v-if="comp.type === 'Script'"
        :node-id="node.id"
        :script-path="comp.props.src"
        :user-values="comp.props.userValues"
        :component="comp"
      />

      <TresPointLight v-if="comp.type === 'Light'" :intensity="comp.props.intensity" :color="comp.props.color" />

      <TresGroup v-if="comp.type === 'Camera'" name="Camera-Anchor-Dummy">
        <CameraGizmo 
           :fov="comp.props.fov"
           :near="comp.props.near"
           :far="comp.props.far"
           :color="comp.props.isMain ? '#42b883' : '#ffffff'"
         />
      </TresGroup>
      
    </template>

    <PhysicsItem 
      v-if="isPlaying.value && groupRef"
      :node="node"
      :object3d="groupRef"
      @created="onPhysicsCreated"
    />

    <GameEntity v-for="child in node.children" :key="child.id" :node="child" />

  </TresGroup>
</template>