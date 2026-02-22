<script setup lang="ts">
import { provide, toRef, onUnmounted, shallowRef, computed } from 'vue' // 🟢 引入 shallowRef
import { TresCanvas } from '@tresjs/core'
import { Environment } from '@tresjs/cientos' 
import * as THREE from 'three'
import { IGameNode } from '../types/schema'
import { EffectComposerPmndrs, BloomPmndrs, FXAAPmndrs, OutlinePmndrs } from '@tresjs/post-processing'
import CameraRig from './CameraRig.vue' 
import PhysicsSystem from './physics/PhysicsSystem.vue'
import { Input, RuntimeRegistry, activeOutlines } from '../engine/Engine'
import UIRenderer from './UIRenderer.vue'
import SceneGraph from './SceneGraph.vue' 
import CSM from './CSM.vue'

const props = defineProps<{
  sceneData: IGameNode[] 
}>()

const register = (id: string, obj: THREE.Object3D) => RuntimeRegistry.set(id, obj)
const unregister = (id: string) => RuntimeRegistry.delete(id)
const get = (id: string) => RuntimeRegistry.get(id)
const mainCameraRef = shallowRef<THREE.PerspectiveCamera | null>(null)

provide('scene-registry', { register, unregister, get })
provide('scene-data-ref', toRef(props, 'sceneData'))
provide('is-playing', { value: true })

onUnmounted(() => {
  Input.unlockCursor();
  RuntimeRegistry.clear();
  (window as any).Effect.Outline.clear();
})

const outlineRenderGroups = computed(() => {
  console.log('🔄 [Outline Debug] Computed 属性被触发更新!');
  console.log('📦 [Outline Debug] 当前 activeOutlines.value:', activeOutlines.value);

  const groups = activeOutlines.value.map(group => {
    console.log(`🔍 [Outline Debug] 正在处理组 (Hash): ${group.id}`);
    console.log(`🎯 [Outline Debug] 组内的 Node IDs:`, Array.from(group.nodeIds));

    const objects: THREE.Object3D[] = [];
    
    group.nodeIds.forEach(id => {
      // 1. 检查有没有从注册表里拿到 Object3D
      const rootObj = RuntimeRegistry.get(id);
      console.log(`🏗️ [Outline Debug] 从 RuntimeRegistry 获取 ID '${id}' =`, rootObj);

      if (rootObj) {
        let meshCount = 0;
        // 2. 检查是否成功找到了 Mesh 子节点
        rootObj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            objects.push(child);
            meshCount++;
          }
        });
        console.log(`🧩 [Outline Debug] 在节点 '${id}' 下找到了 ${meshCount} 个 Mesh`);
      } else {
        console.error(`⚠️ [Outline Debug] 严重: 在 RuntimeRegistry 中找不到 ID '${id}' !`);
      }
    });

    console.log(`✅ [Outline Debug] 收集到的 Mesh 数组:`, objects);
    
    return {
      key: group.id,
      config: group.config,
      objects
    };
  }).filter(g => {
    const isValid = g.objects.length > 0;
    if (!isValid) {
      console.error(`🗑️ [Outline Debug] 组 ${g.key} 被过滤掉了，因为没有找到任何有效的 Mesh!`);
    }
    return isValid;
  });
  return groups;
})

// 🟢 保持线性工作流与色调映射配置
const glConfig = {
  clearColor: '#111', // 运行模式下深色背景更容易看清发光效果
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
  <TresCanvas v-bind="glConfig">
    
    <TresPerspectiveCamera 
      ref="mainCameraRef"
      make-default 
      :position="[0, 5, 10]" 
    />

    <Suspense>
      <EffectComposerPmndrs>
        <BloomPmndrs :intensity="1.5" :luminance-threshold="1.0" :luminance-smoothing="0.1" mipmap-blur />
        <OutlinePmndrs
          v-for="group in outlineRenderGroups"
          :key="group.key"
          :outlinedObjects="group.objects"
          :visibleEdgeColor="group.config.color"
          :hiddenEdgeColor="group.config.color"
          :edgeStrength="group.config.edgeStrength || 200000.0"
          :blur="group.config.blur || false"
          :pulseSpeed="group.config.pulseSpeed || 0.0"
          :multisampling="4.0"
        />
        <FXAAPmndrs v-bind="effectProps" />
      </EffectComposerPmndrs>
    </Suspense>

    <PhysicsSystem>
      <CameraRig :camera-object="mainCameraRef" />

      <Suspense>
        <Environment preset="city" :background="true" :blur="0.5" />
      </Suspense>
      
      <CSM :cascades="4" :intensity="2.0" :shadow-bias="-0.0001">
        <SceneGraph :nodes="sceneData" />
      </CSM>
    </PhysicsSystem>
  </TresCanvas>
  <UIRenderer />
</template>