<script setup lang="ts">
import { watch, onUnmounted, inject, shallowRef } from 'vue'
import { AssetManager } from '../engine/AssetManager'
import * as THREE from 'three'

// 全局配置：是否开启 Debug 模式（生产环境可关）
const DEBUG_MODE = true

const props = defineProps<{
  nodeId: string 
  src: string
  targetNodeName?: string
  recursive?: boolean 
}>()

const projectRoot = inject('project-root') as any
const modelScene = shallowRef<THREE.Object3D | null>(null)
const csmSetupMaterial = inject<(mat: THREE.Material) => void>('csm-setup-material', () => {})

// 状态锁
let lastLoadedKey = ''

const load = async () => {
  if (!projectRoot.value || !props.src) return
  
  // 1. 生成唯一指纹，防止重复执行
  const currentKey = `${props.src}|${props.targetNodeName}|${props.recursive}`
  if (currentKey === lastLoadedKey && modelScene.value) return
  lastLoadedKey = currentKey

  try {
    // 2. 加载整个 GLB (通过 AssetManager 缓存)
    const clonedScene = await AssetManager.loadModel(projectRoot.value, props.src)
    if (!clonedScene) return

    let finalObject: THREE.Object3D | null = null

    // 3. 🎯 核心逻辑：精准提取
    if (props.targetNodeName) {
      // 尝试按名字查找
      const target = clonedScene.getObjectByName(props.targetNodeName)
      
      if (target) {
        // ✅ 找到了！
        // 克隆并重置变换（因为 GameNode 已经负责了位置）
        const clone = target.clone()
        clone.position.set(0, 0, 0)
        clone.rotation.set(0, 0, 0)
        clone.scale.set(1, 1, 1)
        
        // 如果不递归，清空子节点
        if (!props.recursive) {
          clone.clear() 
        }
        finalObject = clone as any
      } else {
        // ❌ 没找到！
        console.error(`[ModelRenderer] 🔴 Target NOT FOUND: "${props.targetNodeName}"`)
        
        // 🔍 调试：打印出所有可用的名字，帮你找原因
        if (DEBUG_MODE) {
          const allNames: string[] = []
          clonedScene.traverse(c => {
             if (c.name) allNames.push(c.name)
          })
          console.warn(`[ModelRenderer] Available names in ${props.src}:`, allNames.slice(0, 50), '...')
        }

        // 🛑 严禁显示整个场景！设置为 null 或者显示一个报错占位符
        finalObject = null 
      }
    } else {
      // 如果没指定 targetName，说明用户真的想看整个模型
      finalObject = clonedScene
    }

    // 4. 只有 finalObject 存在时才渲染
    if (finalObject) {
      finalObject.traverse((child: any) => {
        if (child.isMesh) {
          // 开启基础阴影
          child.castShadow = true
          child.receiveShadow = true
          
          // 🟢 关键：如果该物体有材质，将其注册到 CSM 系统中
          if (child.material) {
            // 如果是数组材质（多个材质），循环注册
            if (Array.isArray(child.material)) {
              child.material.forEach(m => csmSetupMaterial(m))
            } else {
              csmSetupMaterial(child.material)
            }
          }
        }
      })
      modelScene.value = finalObject
    } else {
      // 清空视图
      modelScene.value = null
    }

  } catch (e) {
    console.error(`[ModelRenderer] Error:`, e)
  }
}

watch(() => [props.src, props.targetNodeName, props.recursive], load, { immediate: true })

onUnmounted(() => {
  modelScene.value = null
})
</script>

<template>
  <primitive v-if="modelScene" :object="modelScene" />
  <TresMesh v-else-if="props.targetNodeName" :scale="[0.5, 0.5, 0.5]">
    <TresBoxGeometry />
    <TresMeshBasicMaterial color="red" wireframe />
  </TresMesh>
</template>