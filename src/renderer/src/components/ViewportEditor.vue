<script setup lang="ts">
import { shallowRef, ref, watch, provide } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls, TransformControls, Grid, Environment } from '@tresjs/cientos'
import * as THREE from 'three'
import SceneGraph from './SceneGraph.vue' 
import SelectionBox from './SelectionBox.vue'
import { IGameNode } from '../types/schema'
import UIRenderer from './UIRenderer.vue'
import CSM from './CSM.vue'

// 🟢 引入官方后期处理组件
import { EffectComposerPmndrs, BloomPmndrs, FXAAPmndrs } from '@tresjs/post-processing'

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
provide('is-playing', { value: false }) 

const selectedObjectRef = shallowRef<THREE.Object3D | null>(null)
const isGizmoDragging = ref(false)
const orbitControlsRef = shallowRef(null)

// 对象注册表
const objectRegistry = new Map<string, THREE.Object3D>()
const registerObject = (id: string, object: THREE.Object3D) => objectRegistry.set(id, object)
const unregisterObject = (id: string) => objectRegistry.delete(id)
provide('scene-registry', { 
  register: registerObject, 
  unregister: unregisterObject,
  get: getObject 
})

watch(() => props.selectedId, (newId) => {
  if (!newId) {
    selectedObjectRef.value = null
    return
  }
  const obj = objectRegistry.get(newId)
  if (obj) selectedObjectRef.value = obj
})

// --- 交互逻辑 ---
const onPointerMissed = () => {
  if (isGizmoDragging.value) return
  emit('select', null)
}

// 统一处理点击逻辑
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

const glConfig = {
  clearColor: '#fff', 
  shadows: true,
  alpha: false,
  outputColorSpace: THREE.LinearSRGBColorSpace,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.0
}

const effectProps = {
  samples: 24
}
</script>

<template>
  <TresCanvas v-bind="glConfig" @pointer-missed="onPointerMissed">
    <TresPerspectiveCamera 
      :position="initialCameraPosition" 
      :look-at="initialLookAt" 
      make-default 
    />
    <OrbitControls ref="orbitControlsRef" :enable-damping="false" make-default />
    
    <Suspense>
      <EffectComposerPmndrs>
        <BloomPmndrs
          :intensity="1.5"
          :luminance-threshold="1.0"
          :luminance-smoothing="0.1"
          mipmap-blur
        />
        <FXAAPmndrs v-bind="effectProps" />
      </EffectComposerPmndrs>
    </Suspense>

    <Grid :args="[1000, 1000]" :cell-size="1" :section-size="10" fade-distance="400" infinite-grid />

    <Suspense>
      <Environment preset="city" :blur="0.6" /> 
    </Suspense>

    <CSM :cascades="4" :intensity="1.5" :shadow-bias="-0.0001">
       <SceneGraph 
         :nodes="sceneData" 
         @node-click="onObjectClick" 
       />
    </CSM>
    
    <SelectionBox v-if="selectedObjectRef" :object="selectedObjectRef" />
    <TransformControls 
      v-if="selectedObjectRef" 
      :object="selectedObjectRef" 
      :mode="toolMode" 
      @dragging-changed="onDraggingChanged" 
      @mouse-up="onTransformChange" 
    />

  </TresCanvas>
  <UIRenderer />
</template>