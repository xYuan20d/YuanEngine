<script setup lang="ts">
import { computed, inject, onUnmounted, shallowRef, watch, provide, ref } from 'vue'
import { IGameNode } from '../types/schema'
import * as THREE from 'three'
import CameraGizmo from './CameraGizmo.vue' 
import ScriptRunner from './ScriptRunner.vue'
import PhysicsItem from './physics/PhysicsItem.vue'
import { flattenProps } from '../utils/props' // 🟢 引入解压工具
import ModelRenderer from './ModelRenderer.vue' // 🟢 1. 引入组件
import SkinnedModel from './SkinnedModel.vue'
import UIWidget from './UIWidget.vue' // 🟢 引入组件

defineOptions({ name: 'GameEntity' })

const csmSetupMaterial = inject<(mat: THREE.Material) => void>('csm-setup-material', () => {})

const onMaterialCreated = (mat: any) => {
  // 只要材质一创建，就告诉 CSM 管理器
  csmSetupMaterial(mat)
}

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
  if (group && registry) {
    registry.register(props.node.id, group)
  } else if (!group && registry) {
    // 如果 group 没了（被 v-if 移除），必须注销，否则 RuntimeRegistry 里会有死对象
    registry.unregister(props.node.id)
  }
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
    v-if="node.active"
    :visible="node.visible !== false"
    ref="groupRef"
    :position="position" 
    :rotation="rotation" 
    :scale="scale"
    :name="node.name"
    :user-data="{ 
      id: node.id,
      _node: node 
    }" 
  >
    <template v-for="(comp, index) in node.components" :key="index">
      
      <TresMesh 
        v-if="comp.type === 'Mesh'"
        :user-data="{ id: node.id }" 
        cast-shadow    receive-shadow
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
        
        <TresMeshStandardMaterial 
          :color="flattenProps(comp.props).color" 
          :roughness="flattenProps(comp.props).roughness ?? 0.5"
          :metalness="flattenProps(comp.props).metalness ?? 0.0"
          
          :emissive="flattenProps(comp.props).emissive ?? '#000000'"
          :emissive-intensity="flattenProps(comp.props).emissiveIntensity ?? 1.0"
          
          @ready="onMaterialCreated"
        />
      </TresMesh>

      <ModelRenderer 
        v-if="comp.type === 'ModelRenderer'"
        :node-id="node.id"
        :src="flattenProps(comp.props).src"
        :target-node-name="flattenProps(comp.props).targetNodeName"
        :recursive="flattenProps(comp.props).recursive"
      />

      <SkinnedModel
        v-if="comp.type === 'SkinnedMesh'"
        :node-id="node.id"
        :src="flattenProps(comp.props).src"
        :speed="flattenProps(comp.props).speed"
        :default-animation="flattenProps(comp.props).defaultAnimation"
      />

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

      <UIWidget 
        v-if="comp.type === 'UIWidget' && comp.active !== false"
        
        :src="flattenProps(comp.props).uiPath"
        :node-id="node.id"
        :visible="node.visible !== false"
        
        :mode="flattenProps(comp.props).mode"
        :resolution="flattenProps(comp.props).resolution"
        :occlude="flattenProps(comp.props).occlude"
      />
      
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