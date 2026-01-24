<script setup lang="ts">
import { shallowRef, ref, watch, provide } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls, TransformControls, Grid } from '@tresjs/cientos'
import * as THREE from 'three'
import GameEntity from './GameEntity.vue'
import SelectionBox from './SelectionBox.vue'
import { IGameNode } from '../types/schema'

const initialCameraPosition = [8, 5, 8] as const
const initialLookAt = [0, 0, 0] as const

const getObject = (id: string) => objectRegistry.get(id)

// 定义 Props
const props = defineProps<{
  sceneData: IGameNode[] 
  selectedId: string | null
  toolMode: 'translate' | 'rotate' | 'scale'
}>()

const emit = defineEmits<{
  (e: 'select', id: string | null): void
  (e: 'update:transform', id: string, newTransform: any): void
}>()

// --- 永远只有编辑器逻辑 ---
provide('is-playing', { value: false }) // 强制告诉子组件：现在是编辑模式

const selectedObjectRef = shallowRef<THREE.Object3D | null>(null)
const isGizmoDragging = ref(false)
const orbitControlsRef = shallowRef(null)

// 对象注册表 (用于选中逻辑)
const objectRegistry = new Map<string, THREE.Object3D>()
const registerObject = (id: string, object: THREE.Object3D) => objectRegistry.set(id, object)
const unregisterObject = (id: string) => objectRegistry.delete(id)
provide('scene-registry', { 
  register: registerObject, 
  unregister: unregisterObject,
  get: getObject 
})
// 监听选中
watch(() => props.selectedId, (newId) => {
  if (!newId) {
    selectedObjectRef.value = null
    return
  }
  const obj = objectRegistry.get(newId)
  if (obj) selectedObjectRef.value = obj
})

// --- 交互逻辑 (点击、拖拽) ---
const onPointerMissed = () => {
  if (isGizmoDragging.value) return
  emit('select', null)
}

const onObjectClick = (e: any) => {
  if (isGizmoDragging.value) return
  e.stopPropagation()
  let target = e.object
  while (target && !target.userData.id) target = target.parent
  if (target && target.userData.id) emit('select', target.userData.id)
}

const onTransformChange = () => {
  if (!selectedObjectRef.value || !props.selectedId) return
  const obj = selectedObjectRef.value
  emit('update:transform', props.selectedId, {
    position: [obj.position.x, obj.position.y, obj.position.z],
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: [obj.scale.x, obj.scale.y, obj.scale.z]
  })
}

const onDraggingChanged = (event: any) => {
  isGizmoDragging.value = event.value
  if (orbitControlsRef.value) {
    const controls = orbitControlsRef.value.value || orbitControlsRef.value
    if (controls) controls.enabled = !event.value
  }
}
</script>

<template>
  <TresCanvas clear-color="#f0f2f5" @pointer-missed="onPointerMissed">
    <TresPerspectiveCamera 
      :position="initialCameraPosition" 
      :look-at="initialLookAt" 
      make-default 
    />
    <OrbitControls ref="orbitControlsRef" make-default />
    
    <TresAmbientLight :intensity="0.7" />
    <TresDirectionalLight :position="[10, 10, 10]" :intensity="1.2" />
    <Grid :args="[1000, 1000]" :cell-size="1" :section-size="10" fade-distance="400" infinite-grid />

    <GameEntity 
      v-for="node in sceneData"
      :key="node.id"
      :node="node" 
      @click="onObjectClick" 
    />

    <SelectionBox v-if="selectedObjectRef" :object="selectedObjectRef" />
    <TransformControls
      v-if="selectedObjectRef"
      :object="selectedObjectRef"
      :mode="toolMode"
      @dragging-changed="onDraggingChanged" 
      @mouse-up="onTransformChange"
    />
  </TresCanvas>
</template>