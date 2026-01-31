<script setup lang="ts">
import { computed, inject, onUnmounted, shallowRef, watch, provide, ref } from 'vue'
import { IGameNode } from '../types/schema'
import * as THREE from 'three'
import CameraGizmo from './CameraGizmo.vue' 
import ScriptRunner from './ScriptRunner.vue'
import PhysicsItem from './physics/PhysicsItem.vue'
import { flattenProps } from '../utils/props' // 🟢 引入解压工具

defineOptions({ name: 'GameEntity' })

const props = defineProps<{ node: IGameNode }>()

// 场景注册表
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

// 注册 Three.js 对象
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
    :name="node.name"
    :user-data="{ id: node.id }" 
  >
    <template v-for="(comp, index) in node.components" :key="index">
      
      <TresMesh 
        v-if="comp.type === 'Mesh'"
        :user-data="{ id: node.id }" 
      >
        <TresBoxGeometry 
          v-if="flattenProps(comp.props).geometry === 'Box'" 
          :args="flattenProps(comp.props).args" 
        />
        <TresSphereGeometry 
          v-else-if="flattenProps(comp.props).geometry === 'Sphere'" 
          :args="flattenProps(comp.props).args" 
        />
        <TresPlaneGeometry 
          v-else-if="flattenProps(comp.props).geometry === 'Plane'" 
          :args="flattenProps(comp.props).args" 
        />
        <TresCylinderGeometry 
          v-else-if="flattenProps(comp.props).geometry === 'Cylinder'" 
          :args="flattenProps(comp.props).args" 
        />
        
        <TresMeshStandardMaterial :color="flattenProps(comp.props).color" />
      </TresMesh>

      <ScriptRunner 
        v-if="isPlaying.value && comp.type === 'Script'"
        :node-id="node.id"
        :script-path="comp.props.src"
        :user-values="comp.props.userValues"
        :component="comp"
      />

      <TresPointLight 
        v-if="comp.type === 'Light'" 
        v-bind="flattenProps(comp.props)"
      />

      <TresGroup v-if="comp.type === 'Camera'" name="Camera-Anchor-Dummy">
        <CameraGizmo 
           v-bind="flattenProps(comp.props)"
           :color="flattenProps(comp.props).isMain ? '#42b883' : '#ffffff'"
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