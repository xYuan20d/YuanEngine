<script setup lang="ts">
import { computed, inject, onUnmounted, shallowRef, watch, provide, ref } from 'vue'
import { IGameNode } from '../types/schema'
import * as THREE from 'three'
import CameraGizmo from './CameraGizmo.vue' 
import ScriptRunner from './ScriptRunner.vue'
import PhysicsItem from './physics/PhysicsItem.vue' 

defineOptions({ name: 'GameEntity' })

const props = defineProps<{ node: IGameNode }>()

// 场景注册表 (用于 CameraRig 等快速查找)
const registry = inject<{ 
  register: (id: string, obj: THREE.Object3D) => void,
  unregister: (id: string) => void
}>('scene-registry')

const groupRef = shallowRef<THREE.Group | null>(null)
const isPlaying = inject('is-playing', { value: false })

// 刚体接力 (Physics)
const upstreamBodyRef = inject('parent-body-ref', ref(null))
const myBodyRef = shallowRef(null)

const hasRigidBodyComponent = computed(() => 
  props.node.components.some(c => c.type === 'RigidBody')
)

const bodyToProvide = computed(() => 
  hasRigidBodyComponent.value ? myBodyRef.value : upstreamBodyRef.value
)

provide('parent-body-ref', bodyToProvide)

const onPhysicsCreated = (body: any) => {
  myBodyRef.value = body
}

// 注册 Three.js 对象到 Map 中
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
      
      <TresMesh 
        v-if="comp.type === 'Mesh'"
        :user-data="{ id: node.id }" 
      >
        <TresBoxGeometry v-if="comp.props.geometry === 'Box'" :args="comp.props.args" />
        <TresSphereGeometry v-else-if="comp.props.geometry === 'Sphere'" :args="comp.props.args" />
        <TresPlaneGeometry v-else-if="comp.props.geometry === 'Plane'" :args="comp.props.args" />
        <TresMeshStandardMaterial :color="comp.props.color" />
      </TresMesh>

      <ScriptRunner 
        v-if="isPlaying.value && comp.type === 'Script'"
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